import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeShellExecTool } from "../../src/tool/builtins/shell.ts"

describe("shell_exec", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-shell-tool-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("executes allowlisted command and returns stdout", async () => {
    const tool = makeShellExecTool({ cwd: dir, allowed: ["echo"] })
    const r = await tool.handler({ command: "echo", args: ["hello"] })
    expect(r.stdout.trim()).toBe("hello")
    expect(r.exitCode).toBe(0)
  })

  test("rejects command not in allowlist", async () => {
    const tool = makeShellExecTool({ cwd: dir, allowed: ["echo"] })
    await expect(tool.handler({ command: "ls", args: [] })).rejects.toThrow(/not allowed/i)
  })

  test("captures stderr + non-zero exit", async () => {
    await writeFile(join(dir, "bad.sh"), "#!/bin/sh\necho fail >&2\nexit 3\n")
    const script = join(dir, "bad.sh")
    const tool = makeShellExecTool({ cwd: dir, allowed: ["sh"] })
    const r = await tool.handler({ command: "sh", args: [script] })
    expect(r.exitCode).toBe(3)
    expect(r.stderr).toContain("fail")
  })

  test("risk is critical by default", () => {
    expect(makeShellExecTool({ cwd: dir, allowed: [] }).risk).toBe("critical")
  })
})
