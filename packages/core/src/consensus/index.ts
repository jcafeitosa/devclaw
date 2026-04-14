import type { BridgeRegistry } from "../bridge/registry.ts"
import type { Bridge, BridgeEvent, BridgeRequest, CliId } from "../bridge/types.ts"
import type { BudgetEnforcer } from "../cost/budget.ts"
import type { Step, StepState } from "../cognitive/types.ts"
import type { ProviderCatalog } from "../provider/catalog.ts"
import { RubricEvaluator } from "../reflection/evaluator.ts"

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

export interface ConsensusObserver {
  onParticipantStart?(cli: CliId): void
  onParticipantEvent?(cli: CliId, event: BridgeEvent): void
  onParticipantComplete?(participant: ConsensusParticipant): void
  onScore?(score: ConsensusScore): void
}

export interface ConsensusConfig {
  bridges: BridgeRegistry
  scorer: ConsensusScorer
  clis?: CliId[]
  observer?: ConsensusObserver
  budget?: BudgetEnforcer
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

async function drainBridge(
  bridge: Bridge,
  req: BridgeRequest,
  observer?: ConsensusObserver,
): Promise<ConsensusParticipant> {
  const start = performance.now()
  const events: BridgeEvent[] = []
  let text = ""
  observer?.onParticipantStart?.(bridge.cli)
  try {
    for await (const event of bridge.execute({ ...req, cli: bridge.cli })) {
      events.push(event)
      observer?.onParticipantEvent?.(bridge.cli, event)
      if (event.type === "text") text += event.content
    }
    const participant = { cli: bridge.cli, text, events, durationMs: performance.now() - start }
    observer?.onParticipantComplete?.(participant)
    return participant
  } catch (err) {
    const participant = {
      cli: bridge.cli,
      text,
      events,
      durationMs: performance.now() - start,
      error: {
        message: err instanceof Error ? err.message : String(err),
        code: (err as { code?: string }).code,
      },
    }
    observer?.onParticipantComplete?.(participant)
    return participant
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

  const planned = bridges.map((bridge) => ({
    bridge,
    plannedUsd: bridge.estimateCost(req).costUsd,
  }))
  const plannedUsd = planned.reduce((sum, item) => sum + item.plannedUsd, 0)
  if (cfg.budget) {
    cfg.budget.check({ taskId: req.taskId, sessionId: req.sessionId }, plannedUsd)
    if (plannedUsd > 0) {
      for (const item of planned) {
        cfg.budget.record({
          taskId: req.taskId,
          sessionId: req.sessionId,
          usd: item.plannedUsd,
          at: Date.now(),
        })
      }
    }
  }

  const participants = await Promise.all(
    planned.map(({ bridge }) => drainBridge(bridge, req, cfg.observer)),
  )

  const scores: ConsensusScore[] = await Promise.all(
    participants.map(async (p) => {
      const score = p.error ? { cli: p.cli, score: 0, feedback: p.error.message } : { cli: p.cli, score: await cfg.scorer(p.cli, p.text, p) }
      cfg.observer?.onScore?.(score)
      return score
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

const DEFAULT_JUDGE_PROMPT =
  "You are a strict judge. Rate the following response to the goal from 0 (useless) to 1 (excellent). " +
  "Goal: {{goal}}\nCLI: {{cli}}\nResponse:\n{{text}}"

export interface LLMJudgeScorerConfig {
  catalog: ProviderCatalog
  providerId: string
  model?: string
  goal?: string
  prompt?: string
  maxTokens?: number
  temperature?: number
}

function renderJudgePrompt(
  template: string,
  vars: { cli: CliId; text: string; goal: string },
): string {
  return template
    .replaceAll("{{cli}}", vars.cli)
    .replaceAll("{{text}}", vars.text)
    .replaceAll("{{goal}}", vars.goal)
}

export function makeLLMJudgeScorer(cfg: LLMJudgeScorerConfig): ConsensusScorer {
  const template = cfg.prompt ?? DEFAULT_JUDGE_PROMPT
  const evaluator = new RubricEvaluator({
    criteria: [
      {
        id: "judge",
        description: "Rate the response quality from 0 to 1.",
        kind: "llm",
      },
    ],
    catalog: cfg.catalog,
    providerId: cfg.providerId,
    model: cfg.model,
    maxTokens: cfg.maxTokens ?? 16,
    temperature: cfg.temperature ?? 0,
  })
  return async (cli, text) => {
    if (text.length === 0) return 0
    const step: Step = {
      id: `consensus:${cli}`,
      description: renderJudgePrompt(template, {
        cli,
        text,
        goal: cfg.goal ?? "",
      }),
    }
    const state: StepState = {
      id: step.id,
      status: "completed",
      output: text,
    }
    const result = await evaluator.evaluate(step, state)
    return result.score
  }
}
