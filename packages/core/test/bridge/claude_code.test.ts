import { describe, expect, test } from "bun:test"
import { ClaudeCodeBridge } from "../../src/bridge/claude_code.ts"
import type {
  InjectableProcessRunner,
  ProcessHandle,
  SpawnOptions,
} from "../../src/bridge/process_runner.ts"
import type { BridgeEvent, BridgeRequest } from "../../src/bridge/types.ts"

function handleFrom(stdout: string[], stderr: string[] = [], exitCode = 0): ProcessHandle {
  return {
    pid: 1234,
    stdout: (async function* () {
      for (const l of stdout) yield l
    })(),
    stderr: (async function* () {
      for (const l of stderr) yield l
    })(),
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

const req: BridgeRequest = {
  taskId: "t1",
  agentId: "a",
  cli: "claude",
  cwd: "/tmp",
  prompt: "refactor db layer",
}

async function collect(iter: AsyncIterable<BridgeEvent>): Promise<BridgeEvent[]> {
  const out: BridgeEvent[] = []
  for await (const e of iter) out.push(e)
  return out
}

describe("ClaudeCodeBridge", () => {
  test("isAvailable true when which finds binary", async () => {
    const b = new ClaudeCodeBridge({
      runner: new MockRunner(() => handleFrom([])),
      which: async () => "/usr/local/bin/claude",
    })
    expect(await b.isAvailable()).toBe(true)
  })

  test("isAvailable false when which returns null", async () => {
    const b = new ClaudeCodeBridge({
      runner: new MockRunner(() => handleFrom([])),
      which: async () => null,
    })
    expect(await b.isAvailable()).toBe(false)
  })

  test("execute emits started + JSONL events + completed", async () => {
    const runner = new MockRunner(() =>
      handleFrom([
        JSON.stringify({ type: "thought", content: "planning" }),
        JSON.stringify({ type: "text", content: "done" }),
      ]),
    )
    const b = new ClaudeCodeBridge({
      runner,
      which: async () => "/x/claude",
    })
    const events = await collect(b.execute(req))
    const types = events.map((e) => e.type)
    expect(types[0]).toBe("started")
    expect(types).toContain("thought")
    expect(types).toContain("text")
    expect(types[types.length - 1]).toBe("completed")
  })

  test("passes prompt to claude stdin", async () => {
    const runner = new MockRunner(() => handleFrom([]))
    const b = new ClaudeCodeBridge({
      runner,
      which: async () => "/x/claude",
    })
    await collect(b.execute(req))
    expect(runner.lastOpts.stdin).toContain("refactor db layer")
  })

  test("cancel kills running process by taskId", async () => {
    let killed = false
    const handle: ProcessHandle = {
      pid: 1,
      stdout: (async function* () {})(),
      stderr: (async function* () {})(),
      timedOut: false,
      exited: new Promise(() => {}),
      kill() {
        killed = true
      },
    }
    const runner = new MockRunner(() => handle)
    const b = new ClaudeCodeBridge({
      runner,
      which: async () => "/x/claude",
    })
    // start consuming but don't await
    const iter = b.execute(req)[Symbol.asyncIterator]()
    await iter.next()
    await b.cancel("t1")
    expect(killed).toBe(true)
  })

  test("error event emitted on non-zero exit", async () => {
    const runner = new MockRunner(() => handleFrom([], ["fatal: something broke"], 2))
    const b = new ClaudeCodeBridge({
      runner,
      which: async () => "/x/claude",
    })
    const events = await collect(b.execute(req))
    expect(events.some((e) => e.type === "error")).toBe(true)
  })

  test("estimateCost returns subscription-covered zero", () => {
    const b = new ClaudeCodeBridge({
      runner: new MockRunner(() => handleFrom([])),
      which: async () => "/x/claude",
    })
    const est = b.estimateCost(req)
    expect(est.costUsd).toBe(0)
    expect(est.subscriptionCovered).toBe(true)
  })
})
