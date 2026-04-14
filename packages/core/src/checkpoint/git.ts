import { GitFailedError } from "./errors.ts"

export interface GitResult {
  exitCode: number
  stdout: string
  stderr: string
}

export type GitRunner = (args: string[], opts?: { cwd?: string }) => Promise<GitResult>

export async function defaultGitRunner(
  args: string[],
  opts: { cwd?: string } = {},
): Promise<GitResult> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { exitCode, stdout, stderr }
}

export async function mustRun(
  runner: GitRunner,
  args: string[],
  opts: { cwd?: string } = {},
): Promise<string> {
  const { exitCode, stdout, stderr } = await runner(args, opts)
  if (exitCode !== 0) throw new GitFailedError(args.join(" "), exitCode, stderr)
  return stdout.trim()
}
