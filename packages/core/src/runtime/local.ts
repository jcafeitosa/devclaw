import { RuntimeTimeoutError } from "./errors.ts"
import type { ManagedRuntime, RuntimeResult, RuntimeSpec } from "./types.ts"

export class LocalRuntime implements ManagedRuntime {
  readonly kind = "local"

  async run(spec: RuntimeSpec): Promise<RuntimeResult> {
    const cwd = spec.cwd ?? process.cwd()
    spec.onCwd?.(cwd)
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
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    if (spec.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true
        proc.kill("SIGKILL")
      }, spec.timeoutMs)
    }
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (timer) clearTimeout(timer)
    if (timedOut) throw new RuntimeTimeoutError(spec.timeoutMs ?? 0)
    return {
      exitCode,
      stdout,
      stderr,
      durationMs: performance.now() - started,
      cwd,
    }
  }
}
