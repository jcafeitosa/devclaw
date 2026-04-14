import { describe, expect, test } from "bun:test"
import { ProcessRunner } from "../../src/bridge/process_runner.ts"

describe("ProcessRunner (default impl with Bun.spawn)", () => {
  test("runs echo and captures stdout + exit 0", async () => {
    const runner = new ProcessRunner()
    const handle = runner.spawn(["echo", "hello"])
    const lines: string[] = []
    for await (const line of handle.stdout) {
      lines.push(line)
    }
    const code = await handle.exited
    expect(code).toBe(0)
    expect(lines.join("\n").trim()).toBe("hello")
  })

  test("propagates exit code from failing command", async () => {
    const runner = new ProcessRunner()
    const handle = runner.spawn(["sh", "-c", "exit 7"])
    const code = await handle.exited
    expect(code).toBe(7)
  })

  test("kill() terminates long-running process", async () => {
    const runner = new ProcessRunner()
    const handle = runner.spawn(["sh", "-c", "sleep 60"])
    setTimeout(() => handle.kill(), 20)
    const code = await handle.exited
    expect(code).not.toBe(0)
  })

  test("timeoutMs option aborts and kills process", async () => {
    const runner = new ProcessRunner()
    const handle = runner.spawn(["sh", "-c", "sleep 60"], { timeoutMs: 30 })
    const code = await handle.exited
    expect(code).not.toBe(0)
    expect(handle.timedOut).toBe(true)
  })

  test("stdin is piped when provided", async () => {
    const runner = new ProcessRunner()
    const handle = runner.spawn(["sh", "-c", "cat"], { stdin: "payload-123\n" })
    const lines: string[] = []
    for await (const line of handle.stdout) {
      lines.push(line)
    }
    await handle.exited
    expect(lines.join("")).toContain("payload-123")
  })
})
