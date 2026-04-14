import { describe, expect, test } from "bun:test"
import {
  type LanguageSpec,
  LocalEphemeralCodeExecAdapter,
  UnsupportedLanguageError,
} from "../../../src/runtime/exec/local.ts"
import {
  EphemeralRuntime,
  type ManagedRuntime,
  type RuntimeResult,
  type RuntimeSpec,
} from "../../../src/runtime/index.ts"

describe("LocalEphemeralCodeExecAdapter — kind + execute", () => {
  test("kind reports 'local-ephemeral'", () => {
    const a = new LocalEphemeralCodeExecAdapter()
    expect(a.kind).toBe("local-ephemeral")
  })

  test("executes shell code and captures stdout/exitCode", async () => {
    const a = new LocalEphemeralCodeExecAdapter()
    const r = await a.execute("shell", "echo hi")
    expect(r.stdout.trim()).toBe("hi")
    expect(r.exitCode).toBe(0)
  })

  test("captures non-zero exit and stderr", async () => {
    const a = new LocalEphemeralCodeExecAdapter()
    const r = await a.execute("shell", "echo oops 1>&2; exit 5")
    expect(r.exitCode).toBe(5)
    expect(r.stderr.trim()).toBe("oops")
  })

  test("unsupported language throws UnsupportedLanguageError", async () => {
    const a = new LocalEphemeralCodeExecAdapter()
    await expect(a.execute("brainfuck", "+++[<-]")).rejects.toBeInstanceOf(UnsupportedLanguageError)
  })

  test("supports() reports configured languages", () => {
    const a = new LocalEphemeralCodeExecAdapter()
    expect(a.supports("shell")).toBe(true)
    expect(a.supports("brainfuck")).toBe(false)
  })

  test("listLanguages returns registered language ids", () => {
    const a = new LocalEphemeralCodeExecAdapter()
    expect(a.listLanguages()).toContain("shell")
  })

  test("custom language can be registered with command + filename", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const recorded: { name: string }[] = []
    const fakeRuntime: ManagedRuntime = {
      kind: "fake",
      async run(spec: RuntimeSpec): Promise<RuntimeResult> {
        recorded.push({ name: spec.command.join(" ") })
        const dir = await mkdtemp(`${tmpdir()}/devclaw-exec-fake-`)
        try {
          await spec.onCwd?.(dir)
          return { exitCode: 0, stdout: "ran", stderr: "", durationMs: 0, cwd: dir }
        } finally {
          await rm(dir, { recursive: true, force: true })
        }
      },
    }
    const lang: LanguageSpec = {
      filename: "main.py",
      command: (path) => ["python3", path],
    }
    const a = new LocalEphemeralCodeExecAdapter({
      runtime: fakeRuntime,
      languages: { python: lang },
    })
    const r = await a.execute("python", "print('hi')")
    expect(r.stdout).toBe("ran")
    expect(recorded[0]!.name).toMatch(/python3.*main\.py/)
  })

  test("respects timeoutMs forwarded to the runtime", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    let receivedTimeout: number | undefined
    const fakeRuntime: ManagedRuntime = {
      kind: "fake",
      async run(spec: RuntimeSpec): Promise<RuntimeResult> {
        receivedTimeout = spec.timeoutMs
        const dir = await mkdtemp(`${tmpdir()}/devclaw-exec-fake-`)
        try {
          await spec.onCwd?.(dir)
          return { exitCode: 0, stdout: "", stderr: "", durationMs: 0, cwd: dir }
        } finally {
          await rm(dir, { recursive: true, force: true })
        }
      },
    }
    const a = new LocalEphemeralCodeExecAdapter({ runtime: fakeRuntime })
    await a.execute("shell", "true", { timeoutMs: 500 })
    expect(receivedTimeout).toBe(500)
  })

  test("defaults runtime to EphemeralRuntime when not provided", async () => {
    const a = new LocalEphemeralCodeExecAdapter()
    expect(a.runtime).toBeInstanceOf(EphemeralRuntime)
  })
})
