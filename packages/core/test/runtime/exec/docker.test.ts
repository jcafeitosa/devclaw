import { describe, expect, test } from "bun:test"
import {
  DockerSandboxCodeExecAdapter,
  type DockerSpawner,
} from "../../../src/runtime/exec/docker.ts"
import { UnsupportedLanguageError } from "../../../src/runtime/exec/types.ts"

interface CapturedCmd {
  command: string[]
}

function fakeSpawner(stdout = "ok", exitCode = 0) {
  const calls: CapturedCmd[] = []
  const spawner: DockerSpawner = async (command, opts) => {
    calls.push({ command })
    void opts
    return { exitCode, stdout, stderr: "", durationMs: 0 }
  }
  return { spawner, calls }
}

describe("DockerSandboxCodeExecAdapter — kind + execute", () => {
  test("kind reports 'docker-sandbox'", () => {
    const a = new DockerSandboxCodeExecAdapter({ spawner: fakeSpawner().spawner })
    expect(a.kind).toBe("docker-sandbox")
  })

  test("execute runs `docker run --rm -i --network=none <image>` with code piped via stdin", async () => {
    const { spawner, calls } = fakeSpawner("hi\n")
    const a = new DockerSandboxCodeExecAdapter({ spawner })
    const r = await a.execute("python", "print('hi')")
    expect(r.stdout).toBe("hi\n")
    const cmd = calls[0]!.command
    expect(cmd[0]).toBe("docker")
    expect(cmd).toContain("run")
    expect(cmd).toContain("--rm")
    expect(cmd).toContain("-i")
    expect(cmd).toContain("--network=none")
    expect(cmd.some((c) => c.startsWith("python:"))).toBe(true)
  })

  test("memoryLimit + cpuLimit map to docker flags", async () => {
    const { spawner, calls } = fakeSpawner()
    const a = new DockerSandboxCodeExecAdapter({
      spawner,
      memoryLimit: "256m",
      cpuLimit: "0.5",
    })
    await a.execute("python", "print(1)")
    const cmd = calls[0]!.command
    const mem = cmd.indexOf("--memory")
    expect(mem).toBeGreaterThan(0)
    expect(cmd[mem + 1]).toBe("256m")
    const cpu = cmd.indexOf("--cpus")
    expect(cpu).toBeGreaterThan(0)
    expect(cmd[cpu + 1]).toBe("0.5")
  })

  test("network=true allows network access (omits --network=none)", async () => {
    const { spawner, calls } = fakeSpawner()
    const a = new DockerSandboxCodeExecAdapter({ spawner, network: true })
    await a.execute("python", "import urllib.request")
    expect(calls[0]!.command).not.toContain("--network=none")
  })

  test("custom image map overrides defaults", async () => {
    const { spawner, calls } = fakeSpawner()
    const a = new DockerSandboxCodeExecAdapter({
      spawner,
      images: { python: "my-py:1.0" },
    })
    await a.execute("python", "print(1)")
    expect(calls[0]!.command).toContain("my-py:1.0")
  })

  test("env vars are injected via -e flags", async () => {
    const { spawner, calls } = fakeSpawner()
    const a = new DockerSandboxCodeExecAdapter({ spawner })
    await a.execute("python", "print(1)", { env: { FOO: "bar", X: "y" } })
    const cmd = calls[0]!.command
    const envFlags: string[] = []
    for (let i = 0; i < cmd.length - 1; i++) {
      if (cmd[i] === "-e") envFlags.push(cmd[i + 1]!)
    }
    expect(envFlags).toContain("FOO=bar")
    expect(envFlags).toContain("X=y")
  })

  test("unsupported language throws", async () => {
    const { spawner } = fakeSpawner()
    const a = new DockerSandboxCodeExecAdapter({ spawner })
    await expect(a.execute("brainfuck", "+")).rejects.toBeInstanceOf(UnsupportedLanguageError)
  })

  test("supports + listLanguages reflect configured images", () => {
    const { spawner } = fakeSpawner()
    const a = new DockerSandboxCodeExecAdapter({ spawner })
    expect(a.supports("python")).toBe(true)
    expect(a.supports("brainfuck")).toBe(false)
    expect(a.listLanguages()).toContain("python")
  })

  test("non-zero exit code is surfaced", async () => {
    const { spawner } = fakeSpawner("", 7)
    const a = new DockerSandboxCodeExecAdapter({ spawner })
    const r = await a.execute("python", "raise SystemExit(7)")
    expect(r.exitCode).toBe(7)
  })

  test("timeoutMs passed to spawner", async () => {
    let receivedTimeout: number | undefined
    const spawner: DockerSpawner = async (_cmd, opts) => {
      receivedTimeout = opts?.timeoutMs
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 0 }
    }
    const a = new DockerSandboxCodeExecAdapter({ spawner })
    await a.execute("python", "print(1)", { timeoutMs: 1000 })
    expect(receivedTimeout).toBe(1000)
  })
})
