import { describe, expect, test } from "bun:test"
import { encodeLspMessage } from "../../src/lsp/framing.ts"
import { LSPPool, type LSPSpawner } from "../../src/lsp/pool.ts"
import { LSPRegistry } from "../../src/lsp/registry.ts"

interface FakeProc {
  sent: Uint8Array[]
  deliver: (bytes: Uint8Array) => void
  exitCb?: (exitCode: number) => void
  killed: boolean
  killSignal?: string
  triggerExit: (code: number) => void
}

function fakeSpawner(onSpawn?: (cmd: string[], cwd?: string) => void): {
  spawner: LSPSpawner
  procs: FakeProc[]
} {
  const procs: FakeProc[] = []
  const spawner: LSPSpawner = (opts) => {
    onSpawn?.(opts.command, opts.cwd)
    let onData: ((bytes: Uint8Array) => void) | undefined
    const proc: FakeProc = {
      sent: [],
      deliver: (bytes) => onData?.(bytes),
      killed: false,
      triggerExit(code) {
        proc.exitCb?.(code)
      },
    }
    procs.push(proc)
    return {
      write: (bytes) => {
        proc.sent.push(bytes)
      },
      onData: (cb) => {
        onData = cb
      },
      onExit: (cb) => {
        proc.exitCb = cb
      },
      kill: (signal) => {
        proc.killed = true
        proc.killSignal = signal
      },
    }
  }
  return { spawner, procs }
}

function registry(): LSPRegistry {
  const r = new LSPRegistry()
  r.register("typescript", { command: ["ts-server", "--stdio"] })
  return r
}

describe("LSPPool — acquire / spawn", () => {
  test("acquire spawns the server once per (language, workspace)", async () => {
    const spawned: { cmd: string[]; cwd?: string }[] = []
    const { spawner } = fakeSpawner((cmd, cwd) => spawned.push({ cmd, cwd }))
    const pool = new LSPPool({ registry: registry(), spawner })
    const a = await pool.acquire("typescript", "/w")
    const b = await pool.acquire("typescript", "/w")
    expect(a).toBe(b)
    expect(spawned).toHaveLength(1)
    expect(spawned[0]!.cmd).toEqual(["ts-server", "--stdio"])
    expect(spawned[0]!.cwd).toBe("/w")
  })

  test("different workspaces spawn separate servers", async () => {
    const { spawner, procs } = fakeSpawner()
    const pool = new LSPPool({ registry: registry(), spawner })
    await pool.acquire("typescript", "/w1")
    await pool.acquire("typescript", "/w2")
    expect(procs).toHaveLength(2)
  })

  test("acquire for unregistered language throws", async () => {
    const { spawner } = fakeSpawner()
    const pool = new LSPPool({ registry: registry(), spawner })
    await expect(pool.acquire("python", "/w")).rejects.toThrow(/python/)
  })
})

describe("LSPPool — idle shutdown", () => {
  test("idle timeout kills the server after no activity", async () => {
    const { spawner, procs } = fakeSpawner()
    const pool = new LSPPool({ registry: registry(), spawner, idleTimeoutMs: 20 })
    await pool.acquire("typescript", "/w")
    pool.release("typescript", "/w")
    await new Promise((r) => setTimeout(r, 60))
    expect(procs[0]!.killed).toBe(true)
  })

  test("activity via acquire resets the idle timer", async () => {
    const { spawner, procs } = fakeSpawner()
    const pool = new LSPPool({ registry: registry(), spawner, idleTimeoutMs: 40 })
    await pool.acquire("typescript", "/w")
    pool.release("typescript", "/w")
    await new Promise((r) => setTimeout(r, 20))
    await pool.acquire("typescript", "/w")
    pool.release("typescript", "/w")
    await new Promise((r) => setTimeout(r, 30))
    expect(procs[0]!.killed).toBe(false)
  })
})

describe("LSPPool — crash recovery", () => {
  test("crash respawns with backoff until maxRestarts", async () => {
    const { spawner, procs } = fakeSpawner()
    const pool = new LSPPool({
      registry: registry(),
      spawner,
      maxRestarts: 2,
      restartBackoffMs: 10,
    })
    await pool.acquire("typescript", "/w")
    procs[0]!.triggerExit(1)
    await new Promise((r) => setTimeout(r, 30))
    expect(procs).toHaveLength(2)
    procs[1]!.triggerExit(1)
    await new Promise((r) => setTimeout(r, 30))
    expect(procs).toHaveLength(3)
    procs[2]!.triggerExit(1)
    await new Promise((r) => setTimeout(r, 30))
    expect(procs).toHaveLength(3)
  })

  test("graceful exit (code 0) does not trigger restart", async () => {
    const { spawner, procs } = fakeSpawner()
    const pool = new LSPPool({ registry: registry(), spawner, restartBackoffMs: 5 })
    await pool.acquire("typescript", "/w")
    procs[0]!.triggerExit(0)
    await new Promise((r) => setTimeout(r, 20))
    expect(procs).toHaveLength(1)
  })
})

describe("LSPPool — stats + shutdownAll", () => {
  test("stats reports active servers and per-server activity count", async () => {
    const { spawner } = fakeSpawner()
    const pool = new LSPPool({ registry: registry(), spawner })
    await pool.acquire("typescript", "/w")
    const s = pool.stats()
    expect(s).toHaveLength(1)
    expect(s[0]!.language).toBe("typescript")
    expect(s[0]!.workspace).toBe("/w")
    expect(s[0]!.refCount).toBe(1)
  })

  test("shutdownAll kills all live servers", async () => {
    const { spawner, procs } = fakeSpawner()
    const pool = new LSPPool({ registry: registry(), spawner })
    await pool.acquire("typescript", "/w1")
    await pool.acquire("typescript", "/w2")
    await pool.shutdownAll()
    for (const p of procs) expect(p.killed).toBe(true)
  })
})

describe("LSPPool — routing messages to LSPClient", () => {
  test("acquired client can receive server response", async () => {
    const { spawner, procs } = fakeSpawner()
    const pool = new LSPPool({ registry: registry(), spawner })
    const client = await pool.acquire("typescript", "/w")
    const pending = client.call("custom/ping")
    const sent = procs[0]!.sent.map((b) => new TextDecoder().decode(b)).join("")
    const idMatch = sent.match(/"id":(\d+)/)
    const id = Number(idMatch![1])
    procs[0]!.deliver(encodeLspMessage({ jsonrpc: "2.0", id, result: "pong" }))
    const result = await pending
    expect(result).toBe("pong")
  })
})
