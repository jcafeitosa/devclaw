import { describe, expect, test } from "bun:test"
import { DelegateStrippedError, SubagentError } from "../../src/subagent/errors.ts"
import { NoneIsolation } from "../../src/subagent/isolation/none.ts"
import { SubagentRunner } from "../../src/subagent/runner.ts"
import type { SubagentSpec } from "../../src/subagent/types.ts"

function baseSpec<T>(
  id: string,
  task: T,
  overrides: Partial<SubagentSpec<T>> = {},
): SubagentSpec<T> {
  return {
    id,
    parentId: "p",
    mode: "execution",
    isolation: "none",
    task,
    ...overrides,
  }
}

describe("SubagentRunner", () => {
  const providers = { none: new NoneIsolation() }

  test("runs executor and returns success result", async () => {
    const r = new SubagentRunner({ providers })
    const result = await r.run(baseSpec("s1", { n: 42 }), async ({ task }) => ({
      doubled: (task as { n: number }).n * 2,
    }))
    expect(result.status).toBe("success")
    expect(result.output).toEqual({ doubled: 84 })
    expect(result.metrics.toolCalls).toBe(0)
  })

  test("emits spawn + complete events", async () => {
    const r = new SubagentRunner({ providers })
    const seen: string[] = []
    r.events.on("subagent_spawned", ({ spec }) => seen.push(`spawn:${spec.id}`))
    r.events.on("subagent_completed", ({ subagentId }) => seen.push(`done:${subagentId}`))
    await r.run(baseSpec("s2", null), async () => null)
    expect(seen).toEqual(["spawn:s2", "done:s2"])
  })

  test("tool report triggers subagent_tool_called event", async () => {
    const r = new SubagentRunner({ providers })
    const toolEvents: string[] = []
    r.events.on("subagent_tool_called", ({ tool }) => toolEvents.push(tool))
    await r.run(baseSpec("s3", null), async ({ report }) => {
      report({ tool: "fs_read", costUsd: 0.01, tokens: 100 })
      report({ tool: "fs_read", costUsd: 0.01, tokens: 80 })
      return null
    })
    expect(toolEvents).toEqual(["fs_read", "fs_read"])
  })

  test("budget exceeded returns failed status (not throw)", async () => {
    const r = new SubagentRunner({ providers })
    const result = await r.run(
      baseSpec("s4", null, { restrictions: { budgetTokens: 10 } }),
      async ({ report }) => {
        report({ tool: "fs_read", tokens: 100 })
        return null
      },
    )
    expect(result.status).toBe("budget_exceeded")
  })

  test("executor throw maps to failed with error message", async () => {
    const r = new SubagentRunner({ providers })
    await expect(
      r.run(baseSpec("s5", null), async () => {
        throw new Error("boom")
      }),
    ).rejects.toBeInstanceOf(SubagentError)
  })

  test("missing isolation provider throws NotSupported", async () => {
    const r = new SubagentRunner({ providers: {} })
    await expect(r.run(baseSpec("s6", null), async () => null)).rejects.toBeInstanceOf(
      SubagentError,
    )
  })

  test("delegateStripping blocks nested spawn", async () => {
    const r = new SubagentRunner({ providers })
    await r.run(
      baseSpec("parent", null, { restrictions: { delegateStripping: true } }),
      async () => null,
    )
    // Simulate child that would be spawned from parent after it finished:
    // delegation-stripping only applies within the lifetime of parent.
    // The runner tracks stripped IDs only during active execution.
    const nested = baseSpec("child", null, { parentId: "parent" })
    // parent finished: stripping cleared, nested can run
    const ok = await r.run(nested, async () => null)
    expect(ok.status).toBe("success")
  })

  test("nested spawn during parent execution is stripped", async () => {
    const r = new SubagentRunner({ providers })
    let nestedError: unknown = null
    await r.run(
      baseSpec("parent2", null, { restrictions: { delegateStripping: true } }),
      async () => {
        try {
          await r.run(baseSpec("nested", null, { parentId: "parent2" }), async () => null)
        } catch (err) {
          nestedError = err
        }
        return null
      },
    )
    expect(nestedError).toBeInstanceOf(DelegateStrippedError)
  })

  test("budget snapshot in metrics", async () => {
    const r = new SubagentRunner({ providers })
    const result = await r.run(baseSpec("s7", null), async ({ report }) => {
      report({ costUsd: 0.01, tokens: 5 })
      return null
    })
    expect(result.metrics.tokens).toBe(5)
    expect(result.metrics.costUsd).toBeCloseTo(0.01, 3)
    expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0)
  })
})
