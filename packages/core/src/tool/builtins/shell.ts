import type { Tool } from "../types.ts"

export interface ShellToolConfig {
  cwd: string
  allowed: string[]
  timeoutMs?: number
}

export interface ShellResult {
  stdout: string
  stderr: string
  exitCode: number
}

export function makeShellExecTool(
  cfg: ShellToolConfig,
): Tool<{ command: string; args?: string[] }, ShellResult> {
  const allowed = new Set(cfg.allowed)
  return {
    id: "shell_exec",
    name: "Execute shell command",
    description: "Run an allowlisted binary with arguments",
    risk: "critical",
    timeoutMs: cfg.timeoutMs ?? 30_000,
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        args: { type: "array", items: { type: "string" } },
      },
      required: ["command"],
    },
    async handler({ command, args = [] }, _ctx, signal) {
      if (!allowed.has(command)) {
        throw new Error(`shell_exec: command '${command}' not allowed`)
      }
      const proc = Bun.spawn([command, ...args], {
        cwd: cfg.cwd,
        stdout: "pipe",
        stderr: "pipe",
      })
      const onAbort = () => proc.kill()
      signal?.addEventListener("abort", onAbort)
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const exitCode = await proc.exited
      signal?.removeEventListener("abort", onAbort)
      return { stdout, stderr, exitCode }
    },
  }
}
