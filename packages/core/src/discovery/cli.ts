export interface CLIInfo {
  available: boolean
  path?: string
  version?: string
}

export type CLIReport = Record<string, CLIInfo>

export interface DetectCLIOpts {
  names?: string[]
  which?: (name: string) => Promise<string | null>
  version?: (path: string) => Promise<string>
}

const DEFAULT_NAMES = ["claude", "codex", "gemini", "aider"] as const

export async function defaultWhich(name: string): Promise<string | null> {
  const p = Bun.which(name)
  return p ?? null
}

export async function defaultVersion(path: string): Promise<string> {
  const proc = Bun.spawn([path, "--version"], { stdout: "pipe", stderr: "pipe" })
  const out = await new Response(proc.stdout).text()
  await proc.exited
  return out.trim().split("\n")[0] ?? ""
}

export async function detectCLIs(opts: DetectCLIOpts = {}): Promise<CLIReport> {
  const names = opts.names ?? [...DEFAULT_NAMES]
  const which = opts.which ?? defaultWhich
  const version = opts.version ?? defaultVersion
  const report: CLIReport = {}

  for (const name of names) {
    const path = await which(name)
    if (!path) {
      report[name] = { available: false }
      continue
    }
    let ver: string | undefined
    try {
      const v = await version(path)
      if (v.length > 0) ver = v
    } catch {
      ver = undefined
    }
    report[name] = { available: true, path, ...(ver ? { version: ver } : {}) }
  }

  return report
}
