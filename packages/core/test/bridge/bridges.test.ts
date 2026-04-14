import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "../../src/auth/filesystem_store.ts"
import { makeAiderBridge } from "../../src/bridge/aider.ts"
import { makeCodexBridge } from "../../src/bridge/codex.ts"
import { makeGeminiBridge } from "../../src/bridge/gemini.ts"
import type {
  InjectableProcessRunner,
  ProcessHandle,
  SpawnOptions,
} from "../../src/bridge/process_runner.ts"
import type { BridgeEvent, BridgeRequest } from "../../src/bridge/types.ts"

function handleFrom(stdout: string[], exitCode = 0): ProcessHandle {
  return {
    pid: 1,
    stdout: (async function* () {
      for (const l of stdout) yield l
    })(),
    stderr: (async function* () {})(),
    get timedOut() {
      return false
    },
    exited: Promise.resolve(exitCode),
    kill() {},
  }
}

class MockRunner implements InjectableProcessRunner {
  lastCmd: string[] = []
  lastOpts: SpawnOptions = {}
  constructor(private readonly factory: () => ProcessHandle) {}
  spawn(cmd: string[], opts: SpawnOptions = {}): ProcessHandle {
    this.lastCmd = cmd
    this.lastOpts = opts
    return this.factory()
  }
}

const baseReq: BridgeRequest = {
  taskId: "t",
  agentId: "a",
  cli: "codex",
  cwd: "/tmp",
  prompt: "refactor",
}

async function collect(iter: AsyncIterable<BridgeEvent>): Promise<BridgeEvent[]> {
  const out: BridgeEvent[] = []
  for await (const e of iter) out.push(e)
  return out
}

describe("makeCodexBridge", () => {
  test("uses 'codex exec --json' binary args + JSONL parser", async () => {
    const runner = new MockRunner(() =>
      handleFrom([JSON.stringify({ type: "text", content: "ok" })]),
    )
    const b = makeCodexBridge({ runner, which: async () => "/x/codex" })
    await collect(b.execute({ ...baseReq, cli: "codex" }))
    expect(runner.lastCmd).toEqual(["codex", "exec", "--json"])
  })

  test("isAuthenticated consults AuthStore when provided", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codex-auth-"))
    try {
      const store = new FilesystemAuthStore({ dir, passphrase: "pw" })
      await store.save("codex", {
        type: "oauth",
        accessToken: "t",
        expiresAt: Date.now() + 10_000,
      })
      const b = makeCodexBridge({
        runner: new MockRunner(() => handleFrom([])),
        which: async () => "/x/codex",
        authStore: store,
      })
      const auth = await b.isAuthenticated()
      expect(auth.authed).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("isAuthenticated false when store has no codex entry", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codex-auth-"))
    try {
      const store = new FilesystemAuthStore({ dir, passphrase: "pw" })
      const b = makeCodexBridge({
        runner: new MockRunner(() => handleFrom([])),
        which: async () => "/x/codex",
        authStore: store,
      })
      expect((await b.isAuthenticated()).authed).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("makeGeminiBridge", () => {
  test("uses text parser and emits text events", async () => {
    const runner = new MockRunner(() => handleFrom(["line one", "line two"]))
    const b = makeGeminiBridge({ runner, which: async () => "/x/gemini" })
    const events = await collect(b.execute({ ...baseReq, cli: "gemini" }))
    const textLines = events.filter((e) => e.type === "text")
    expect(textLines.map((e) => (e.type === "text" ? e.content : ""))).toEqual([
      "line one",
      "line two",
    ])
  })

  test("advertises multimodal + web search", () => {
    const b = makeGeminiBridge({
      runner: new MockRunner(() => handleFrom([])),
      which: async () => "/x/gemini",
    })
    const caps = b.capabilities()
    expect(caps.supportsMultimodal).toBe(true)
    expect(caps.supportsWebSearch).toBe(true)
  })
})

describe("makeAiderBridge", () => {
  test("passes --message + relevant files", async () => {
    const runner = new MockRunner(() => handleFrom([]))
    const b = makeAiderBridge({ runner, which: async () => "/x/aider" })
    await collect(
      b.execute({
        ...baseReq,
        cli: "aider",
        workspace: { filesRelevant: ["src/a.ts", "src/b.ts"] },
      }),
    )
    expect(runner.lastCmd).toContain("--message")
    expect(runner.lastCmd).toContain("src/a.ts")
    expect(runner.lastCmd).toContain("src/b.ts")
  })

  test("capabilities focus on refactor", () => {
    const b = makeAiderBridge({
      runner: new MockRunner(() => handleFrom([])),
      which: async () => "/x/aider",
    })
    expect(b.capabilities().preferredFor).toContain("refactor")
  })
})
