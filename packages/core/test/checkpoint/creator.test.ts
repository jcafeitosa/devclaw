import { describe, expect, test } from "bun:test"
import { CheckpointCreator } from "../../src/checkpoint/creator.ts"
import { GitFailedError } from "../../src/checkpoint/errors.ts"
import type { GitResult } from "../../src/checkpoint/git.ts"
import { InMemoryCheckpointStore } from "../../src/checkpoint/store.ts"

function makeGitMock(responses: Record<string, GitResult>) {
  const calls: string[][] = []
  const runner = async (args: string[]): Promise<GitResult> => {
    calls.push(args)
    const key = args[0] ?? ""
    return responses[args.join(" ")] ?? responses[key] ?? { exitCode: 0, stdout: "", stderr: "" }
  }
  return { runner, calls }
}

describe("CheckpointCreator", () => {
  test("creates checkpoint with stash sha when dirty tree", async () => {
    const store = new InMemoryCheckpointStore()
    const { runner, calls } = makeGitMock({
      "add -A": { exitCode: 0, stdout: "", stderr: "" },
      stash: { exitCode: 0, stdout: "deadbeef\n", stderr: "" },
      "update-ref": { exitCode: 0, stdout: "", stderr: "" },
    })
    const creator = new CheckpointCreator({ store, git: runner })
    const cp = await creator.create({ name: "test", trigger: "pre-migration" })
    expect(cp.sha).toBe("deadbeef")
    expect(cp.trigger).toBe("pre-migration")
    expect(calls.some((c) => c[0] === "stash" && c[1] === "create")).toBe(true)
    expect(calls.some((c) => c[0] === "update-ref")).toBe(true)
    expect((await store.list())[0]?.id).toBe(cp.id)
  })

  test("falls back to HEAD sha when stash create produces no output (clean tree)", async () => {
    const store = new InMemoryCheckpointStore()
    const { runner } = makeGitMock({
      "add -A": { exitCode: 0, stdout: "", stderr: "" },
      stash: { exitCode: 0, stdout: "", stderr: "" },
      "rev-parse HEAD": { exitCode: 0, stdout: "cafebabe", stderr: "" },
      "update-ref": { exitCode: 0, stdout: "", stderr: "" },
    })
    const creator = new CheckpointCreator({ store, git: runner })
    const cp = await creator.create({ name: "clean" })
    expect(cp.sha).toBe("cafebabe")
    expect(cp.meta?.empty).toBe("true")
  })

  test("git failure surfaces as GitFailedError", async () => {
    const store = new InMemoryCheckpointStore()
    const { runner } = makeGitMock({
      "add -A": { exitCode: 128, stdout: "", stderr: "fatal: not a git repo" },
    })
    const creator = new CheckpointCreator({ store, git: runner })
    await expect(creator.create()).rejects.toBeInstanceOf(GitFailedError)
  })

  test("pinned + taskId + meta flow into checkpoint", async () => {
    const store = new InMemoryCheckpointStore()
    const { runner } = makeGitMock({
      stash: { exitCode: 0, stdout: "beef\n", stderr: "" },
    })
    const creator = new CheckpointCreator({ store, git: runner })
    const cp = await creator.create({
      name: "x",
      pinned: true,
      taskId: "t42",
      meta: { note: "important" },
    })
    expect(cp.pinned).toBe(true)
    expect(cp.taskId).toBe("t42")
    expect(cp.meta?.note).toBe("important")
  })
})
