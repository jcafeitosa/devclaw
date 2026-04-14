import { describe, expect, test } from "bun:test"
import { RuntimeTimeoutError } from "../../src/runtime/errors.ts"
import { LocalRuntime } from "../../src/runtime/local.ts"

describe("LocalRuntime", () => {
  const rt = new LocalRuntime()

  test("captures stdout from echo", async () => {
    const r = await rt.run({ command: ["echo", "hello"] })
    expect(r.stdout.trim()).toBe("hello")
    expect(r.exitCode).toBe(0)
  })

  test("captures non-zero exit code", async () => {
    const r = await rt.run({ command: ["sh", "-c", "exit 7"] })
    expect(r.exitCode).toBe(7)
  })

  test("captures stderr separately", async () => {
    const r = await rt.run({ command: ["sh", "-c", "echo err 1>&2"] })
    expect(r.stderr.trim()).toBe("err")
  })

  test("respects timeout (kills + throws RuntimeTimeoutError)", async () => {
    await expect(
      rt.run({ command: ["sh", "-c", "sleep 5"], timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(RuntimeTimeoutError)
  })

  test("respects cwd", async () => {
    const { realpath } = await import("node:fs/promises")
    const tmp = await realpath("/tmp")
    const r = await rt.run({ command: ["pwd"], cwd: tmp })
    expect(r.stdout.trim()).toBe(tmp)
  })

  test("env vars are injected without leaking process env", async () => {
    const r = await rt.run({
      command: ["sh", "-c", "echo $DEVCLAW_TEST"],
      env: { DEVCLAW_TEST: "marker" },
      inheritEnv: false,
    })
    expect(r.stdout.trim()).toBe("marker")
  })

  test("stdin is forwarded when provided", async () => {
    const r = await rt.run({ command: ["cat"], stdin: "piped" })
    expect(r.stdout).toBe("piped")
  })

  test("captures duration metric", async () => {
    const r = await rt.run({ command: ["true"] })
    expect(r.durationMs).toBeGreaterThanOrEqual(0)
  })
})
