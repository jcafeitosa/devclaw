import type { CliId } from "@devclaw/core/bridge"
import {
  ConsensusNoBridgesError,
  type ConsensusScorer,
  runConsensus,
} from "@devclaw/core/consensus"

import type { CommandDef } from "../registry.ts"
import type { Runtime } from "../runtime.ts"
import { renderConsensusLive, type ConsensusLiveAppProps } from "./consensus_live.tsx"

const LENGTH_CEILING = 2000

export const defaultLengthScorer: ConsensusScorer = async (_cli, text) => {
  if (text.length === 0) return 0
  const normalized = Math.min(text.length, LENGTH_CEILING) / LENGTH_CEILING
  return 0.1 + normalized * 0.9
}

function parseCliList(raw: unknown): CliId[] | undefined {
  if (typeof raw !== "string" || raw.trim().length === 0) return undefined
  return raw
    .split(",")
    .map((s) => s.trim() as CliId)
    .filter((s) => s.length > 0)
}

export interface ConsensusCommandOptions {
  renderLive?: (props: ConsensusLiveAppProps) => Promise<number>
}

export function makeConsensusCommand(
  getRuntime: () => Promise<Runtime>,
  opts: ConsensusCommandOptions = {},
): CommandDef {
  const renderLive = opts.renderLive ?? renderConsensusLive
  return {
    name: "consensus",
    describe: "Fan out a prompt across available CLI bridges and pick the best reply",
    usage: 'devclaw consensus --prompt "..." [--cli claude,codex] [--live] [--json]',
    flags: [
      { name: "prompt", describe: "Prompt text", required: true },
      { name: "cli", describe: "Comma-separated subset of CLI bridges (default: all registered)" },
      { name: "task", describe: "Task id (default: generated)" },
      { name: "live", describe: "Render live Ink TUI", type: "boolean" },
      { name: "json", describe: "Emit machine-readable JSON result", type: "boolean" },
    ],
    async handler({ args, stdout, stderr }) {
      const prompt =
        typeof args.flags.prompt === "string" && args.flags.prompt.length > 0
          ? args.flags.prompt
          : args.positional[0]
      if (!prompt) {
        stderr("missing --prompt")
        return 2
      }
      const clis = parseCliList(args.flags.cli)
      const taskId =
        (typeof args.flags.task === "string" && args.flags.task) || `task_${Date.now()}`
      const runtime = await getRuntime()
      try {
        if (args.flags.json) {
          const result = await runConsensus(
            { bridges: runtime.bridges, scorer: defaultLengthScorer, clis },
            {
              taskId,
              agentId: "cli",
              cli: "claude",
              cwd: process.cwd(),
              prompt,
            },
          )
          stdout(JSON.stringify(result, null, 2))
          return 0
        }
        if (args.flags.live === true) {
          return await renderLive({
            runtime,
            prompt,
            taskId,
            clis,
            scorer: defaultLengthScorer,
          })
        }
        const result = await runConsensus(
          { bridges: runtime.bridges, scorer: defaultLengthScorer, clis },
          {
            taskId,
            agentId: "cli",
            cli: "claude",
            cwd: process.cwd(),
            prompt,
          },
        )
        stdout(`winner: ${result.winner}`)
        stdout("---")
        stdout(result.winnerText)
        stdout("---")
        stdout("scores:")
        const sorted = [...result.scores].sort((a, b) => b.score - a.score)
        for (const s of sorted) {
          const mark = s.cli === result.winner ? "* " : "  "
          stdout(`${mark}${s.cli.padEnd(10)} ${s.score.toFixed(2)}`)
        }
        stdout(`total ${result.durationMs.toFixed(0)}ms`)
        return 0
      } catch (err) {
        if (err instanceof ConsensusNoBridgesError) {
          stderr(err.message)
          return 1
        }
        throw err
      }
    },
  }
}
