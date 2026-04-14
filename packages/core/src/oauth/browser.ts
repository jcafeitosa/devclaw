import { OAuthBrowserUnavailableError } from "./errors.ts"

export type Platform = "darwin" | "linux" | "win32" | (string & {})

export function resolveOpenCommand(platform: Platform): string[] {
  if (platform === "darwin") return ["open"]
  if (platform === "linux") return ["xdg-open"]
  if (platform === "win32") return ["cmd", "/c", "start", ""]
  throw new Error(`unsupported platform: ${platform}`)
}

export interface OpenBrowserOpts {
  url: string
  platform?: Platform
  isTTY?: boolean
  printer?: (msg: string) => void
  spawner?: (cmd: string[]) => void
}

export async function openBrowser(opts: OpenBrowserOpts): Promise<void> {
  const platform = opts.platform ?? (process.platform as Platform)
  const isTTY = opts.isTTY ?? Boolean(process.stdout.isTTY)
  const printer = opts.printer ?? ((s) => process.stdout.write(`${s}\n`))
  const spawner = opts.spawner ?? defaultSpawner

  if (!isTTY) {
    printer(`Open this URL to continue authorization:\n\n  ${opts.url}\n`)
    return
  }

  try {
    const cmd = [...resolveOpenCommand(platform), opts.url]
    spawner(cmd)
    printer(`Opening browser: ${opts.url}`)
  } catch {
    throw new OAuthBrowserUnavailableError()
  }
}

function defaultSpawner(cmd: string[]): void {
  const [head, ...rest] = cmd
  if (!head) throw new Error("empty command")
  const proc = Bun.spawn([head, ...rest], { stdout: "ignore", stderr: "ignore" })
  void proc.exited
}
