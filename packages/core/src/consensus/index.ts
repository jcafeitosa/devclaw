import type { BridgeRegistry } from "../bridge/registry.ts"
import type { Bridge, BridgeEvent, BridgeRequest, CliId } from "../bridge/types.ts"

export interface ConsensusParticipant {
  cli: CliId
  text: string
  events: BridgeEvent[]
  durationMs: number
  error?: { message: string; code?: string }
}

export interface ConsensusScore {
  cli: CliId
  score: number
  feedback?: string
}

export interface ConsensusResult {
  winner: CliId
  winnerText: string
  scores: ConsensusScore[]
  participants: ConsensusParticipant[]
  durationMs: number
}

export interface ConsensusScorer {
  (cli: CliId, text: string, participant: ConsensusParticipant): Promise<number>
}

export interface ConsensusConfig {
  bridges: BridgeRegistry
  scorer: ConsensusScorer
  clis?: CliId[]
}

export class ConsensusNoBridgesError extends Error {
  readonly code = "CONSENSUS_NO_BRIDGES" as const
  constructor(reason: string) {
    super(`consensus: no eligible bridges (${reason})`)
    this.name = "ConsensusNoBridgesError"
  }
}

async function eligibleBridges(
  registry: BridgeRegistry,
  filter: CliId[] | undefined,
): Promise<Bridge[]> {
  const all = registry.list()
  const scoped = filter && filter.length > 0 ? all.filter((b) => filter.includes(b.cli)) : all
  const out: Bridge[] = []
  for (const bridge of scoped) {
    const available = await bridge.isAvailable()
    if (!available) continue
    const auth = await bridge.isAuthenticated()
    if (!auth.authed) continue
    out.push(bridge)
  }
  return out
}

async function drainBridge(bridge: Bridge, req: BridgeRequest): Promise<ConsensusParticipant> {
  const start = performance.now()
  const events: BridgeEvent[] = []
  let text = ""
  try {
    for await (const event of bridge.execute({ ...req, cli: bridge.cli })) {
      events.push(event)
      if (event.type === "text") text += event.content
    }
    return { cli: bridge.cli, text, events, durationMs: performance.now() - start }
  } catch (err) {
    return {
      cli: bridge.cli,
      text,
      events,
      durationMs: performance.now() - start,
      error: {
        message: err instanceof Error ? err.message : String(err),
        code: (err as { code?: string }).code,
      },
    }
  }
}

function pickWinner(scores: ConsensusScore[]): CliId {
  const sorted = [...scores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.cli.localeCompare(b.cli)
  })
  const first = sorted[0]
  if (!first) throw new ConsensusNoBridgesError("no scored participants")
  return first.cli
}

export async function runConsensus(
  cfg: ConsensusConfig,
  req: BridgeRequest,
): Promise<ConsensusResult> {
  const start = performance.now()
  const bridges = await eligibleBridges(cfg.bridges, cfg.clis)
  if (bridges.length === 0) {
    throw new ConsensusNoBridgesError(
      cfg.clis ? `none of ${cfg.clis.join(",")} available` : "registry empty",
    )
  }

  const participants = await Promise.all(bridges.map((b) => drainBridge(b, req)))

  const scores: ConsensusScore[] = await Promise.all(
    participants.map(async (p) => {
      if (p.error) return { cli: p.cli, score: 0, feedback: p.error.message }
      const score = await cfg.scorer(p.cli, p.text, p)
      return { cli: p.cli, score }
    }),
  )

  const winner = pickWinner(scores)
  const winnerParticipant = participants.find((p) => p.cli === winner)
  return {
    winner,
    winnerText: winnerParticipant?.text ?? "",
    scores,
    participants,
    durationMs: performance.now() - start,
  }
}
