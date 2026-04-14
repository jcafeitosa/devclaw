import { describe, expect, test } from "bun:test"
import { GitFailedError } from "../../src/checkpoint/errors.ts"
import type { GitResult } from "../../src/checkpoint/git.ts"
import { CheckpointRestorer } from "../../src/checkpoint/restorer.ts"
import { InMemoryCheckpointStore } from "../../src/checkpoint/store.ts"

async function populate(store: InMemoryCheckpointStore) {
  await store.save({
    id: "c1",
    name: "c1",
    sha: "deadbeef",
    trigger: "manual",
    createdAt: Date.now(),
  })
}

function makeGit(respond: (args: string[]) => GitResult) {
  const calls: string[][] = []
  const runner = async (args: string[]): Promise<GitResult> => {
    calls.push(args)
    return respond(args)
  }
  return { runner, calls }
}

describe("CheckpointRestorer", () => {
  test("apply mode uses stash apply --index", async () => {
    const store = new InMemoryCheckpointStore()
    await populate(store)
    const { runner, calls } = makeGit(() => ({ exitCode: 0, stdout: "", stderr: "" }))
    const r = new CheckpointRestorer({ store, git: runner })
    const result = await r.restore("c1")
    expect(result.mode).toBe("apply")
    expect(calls[0]).toEqual(["stash", "apply", "--index", "deadbeef"])
  })

  test("reset mode uses reset --hard", async () => {
    const store = new InMemoryCheckpointStore()
    await populate(store)
    const { runner, calls } = makeGit(() => ({ exitCode: 0, stdout: "", stderr: "" }))
    const r = new CheckpointRestorer({ store, git: runner })
    await r.restore("c1", { mode: "reset" })
    expect(calls[0]).toEqual(["reset", "--hard", "deadbeef"])
  })

  test("git failure surfaces as GitFailedError", async () => {
    const store = new InMemoryCheckpointStore()
    await populate(store)
    const { runner } = makeGit(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "conflict",
    }))
    const r = new CheckpointRestorer({ store, git: runner })
    await expect(r.restore("c1")).rejects.toBeInstanceOf(GitFailedError)
  })

  test("verify returns true when cat-file exit 0", async () => {
    const store = new InMemoryCheckpointStore()
    await populate(store)
    const { runner } = makeGit(() => ({ exitCode: 0, stdout: "commit", stderr: "" }))
    const r = new CheckpointRestorer({ store, git: runner })
    expect(await r.verify("c1")).toBe(true)
  })

  test("verify returns false when object missing", async () => {
    const store = new InMemoryCheckpointStore()
    await populate(store)
    const { runner } = makeGit(() => ({ exitCode: 128, stdout: "", stderr: "missing" }))
    const r = new CheckpointRestorer({ store, git: runner })
    expect(await r.verify("c1")).toBe(false)
  })
})
