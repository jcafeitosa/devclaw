import { describe, expect, test } from "bun:test"
import type { GitResult } from "../../src/checkpoint/git.ts"
import { CheckpointManager } from "../../src/checkpoint/manager.ts"

function staticGit(map: Record<string, GitResult>) {
  const calls: string[][] = []
  const runner = async (args: string[]): Promise<GitResult> => {
    calls.push(args)
    return map[args.join(" ")] ?? map[args[0] ?? ""] ?? { exitCode: 0, stdout: "", stderr: "" }
  }
  return { runner, calls }
}

describe("CheckpointManager", () => {
  test("create → prune flow applies retention", async () => {
    const { runner } = staticGit({
      stash: { exitCode: 0, stdout: "beef\n", stderr: "" },
    })
    const mgr = new CheckpointManager({
      creator: { git: runner },
      restorer: { git: runner },
      retention: { hotLimit: 2, coldLimit: 4, pinnedAlwaysKept: true },
    })
    for (let i = 0; i < 6; i++) {
      await mgr.create({ name: `c${i}` })
      await Bun.sleep(2)
    }
    expect((await mgr.list()).length).toBeLessThanOrEqual(4)
  })

  test("restore delegates to creator via stored checkpoint", async () => {
    const { runner, calls } = staticGit({
      stash: { exitCode: 0, stdout: "aa\n", stderr: "" },
    })
    const mgr = new CheckpointManager({
      creator: { git: runner },
      restorer: { git: runner },
    })
    const cp = await mgr.create({ name: "rest-test" })
    await mgr.restore(cp.id)
    expect(calls.some((c) => c[0] === "stash" && c[1] === "apply")).toBe(true)
  })

  test("chatRewind is exposed and separate from checkpoint store", () => {
    const mgr = new CheckpointManager({
      creator: { git: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
    })
    mgr.chatRewind.append({ id: "m1", role: "user", content: "hi", at: 1 })
    expect(mgr.chatRewind.list()).toHaveLength(1)
  })
})
