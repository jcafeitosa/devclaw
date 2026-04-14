import { RuntimeTimeoutError } from "./errors.ts"
import type { ManagedRuntime, RuntimeResult, RuntimeSpec } from "./types.ts"

export class LocalRuntime implements ManagedRuntime {
  readonly kind = "local"

  async run(spec: RuntimeSpec): Promise<RuntimeResult> {
    const cwd = spec.cwd ?? process.cwd()
    await spec.onCwd?.(cwd)
    const env =
      spec.inheritEnv === false ? (spec.env ?? {}) : { ...process.env, ...(spec.env ?? {}) }
    const started = performance.now()
    const proc = Bun.spawn(spec.command, {
      cwd,
      env,
      stdin: spec.stdin !== undefined ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    if (spec.stdin !== undefined && proc.stdin) {
      proc.stdin.write(spec.stdin)
      await proc.stdin.end()
    }
    if (spec.timeoutMs !== undefined) {
      const timeoutMs = spec.timeoutMs
      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), timeoutMs),
      )
      const winner = await Promise.race([proc.exited.then(() => "done" as const), timeout])
      if (winner === "timeout") {
        proc.kill("SIGKILL")
        throw new RuntimeTimeoutError(timeoutMs)
      }
    }
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    return {
      exitCode,
      stdout,
      stderr,
      durationMs: performance.now() - started,
      cwd,
    }
  }
}
