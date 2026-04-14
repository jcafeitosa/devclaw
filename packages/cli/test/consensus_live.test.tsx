import { describe, expect, test } from "bun:test"
import { BudgetEnforcer } from "@devclaw/core/cost"
import { renderToString } from "ink"

import { type ConsensusLiveSnapshot, ConsensusLiveView } from "../src/commands/consensus_live.tsx"

describe("ConsensusLiveView", () => {
  test("renders winner, scores, and participant snippets", () => {
    const snapshot: ConsensusLiveSnapshot = {
      prompt: "plan refactor",
      taskId: "task_123",
      startedAt: Date.now() - 1234,
      phase: "done",
      participants: {
        claude: {
          cli: "claude",
          status: "scored",
          text: "short answer",
          events: 2,
          score: 0.33,
        },
        codex: {
          cli: "codex",
          status: "scored",
          text: "a much longer and better structured answer for the task",
          events: 4,
          score: 0.91,
        },
      },
      order: ["claude", "codex"],
      winner: "codex",
      winnerText: "a much longer and better structured answer for the task",
      durationMs: 1234,
    }

    const output = renderToString(<ConsensusLiveView snapshot={snapshot} />, { columns: 80 })
    expect(output).toContain("devclaw consensus")
    expect(output).toContain("task: task_123")
    expect(output).toContain("phase: done")
    expect(output).toContain("claude")
    expect(output).toContain("score=0.33")
    expect(output).toContain("winner: codex")
    expect(output).toContain("winner text:")
  })

  test("renders budget summary and warnings", () => {
    const budget = new BudgetEnforcer({
      limits: { taskUsd: 0.15, sessionUsd: 2, dayUsd: 10 },
    })
    budget.record({ taskId: "task_123", sessionId: "session_1", usd: 0.13, at: Date.now() })
    const snapshot: ConsensusLiveSnapshot = {
      prompt: "plan refactor",
      taskId: "task_123",
      startedAt: Date.now() - 1234,
      phase: "running",
      participants: {},
      order: [],
    }

    const output = renderToString(<ConsensusLiveView snapshot={snapshot} budget={budget} />, {
      columns: 80,
    })
    expect(output).toContain("budget:")
    expect(output).toContain("task: $0.13 / $0.15")
    expect(output).toContain("warning:")
  })
})
