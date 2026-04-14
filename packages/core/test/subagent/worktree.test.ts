import { describe, expect, test } from "bun:test"
import { IsolationFailedError } from "../../src/subagent/errors.ts"
import { WorktreeIsolation } from "../../src/subagent/isolation/worktree.ts"

describe("WorktreeIsolation", () => {
  test("calls git worktree add with branch + workdir", async () => {
    const calls: string[][] = []
    const git = async (cmd: string[]) => {
      calls.push(cmd)
      return { exitCode: 0, stderr: "" }
    }
    const w = new WorktreeIsolation({ repoRoot: "/tmp/repo", git })
    const alloc = await w.allocate({ subagentId: "s1" })
    expect(calls[0]?.[0]).toBe("worktree")
    expect(calls[0]?.[1]).toBe("add")
    expect(calls[0]?.[2]).toBe("-b")
    expect(alloc.workdir).toContain("s1")
    await alloc.cleanup()
    expect(calls.some((c) => c[0] === "worktree" && c[1] === "remove")).toBe(true)
    expect(calls.some((c) => c[0] === "branch" && c[1] === "-D")).toBe(true)
  })

  test("failed add throws IsolationFailedError", async () => {
    const git = async () => ({ exitCode: 1, stderr: "fatal: not a git repo" })
    const w = new WorktreeIsolation({ repoRoot: "/tmp/nope", git })
    await expect(w.allocate({ subagentId: "s" })).rejects.toBeInstanceOf(IsolationFailedError)
  })

  test("custom baseRef flows through", async () => {
    const calls: string[][] = []
    const git = async (cmd: string[]) => {
      calls.push(cmd)
      return { exitCode: 0, stderr: "" }
    }
    const w = new WorktreeIsolation({ repoRoot: "/r", baseRef: "main", git })
    const alloc = await w.allocate({ subagentId: "s" })
    expect(calls[0]?.[5]).toBe("main")
    await alloc.cleanup()
  })
})
