import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

import type { CommandDef } from "../registry.ts"

export const DEFAULT_BRIDGE_CLIS = ["claude", "codex", "gemini", "aider"] as const

export type BridgeCli = (typeof DEFAULT_BRIDGE_CLIS)[number]

export interface BridgeLockEntry {
  cli: BridgeCli
  path: string
  sha256: string
  version?: string
  pinnedAt: number
}

export interface BridgesLock {
  version: 1
  entries: BridgeLockEntry[]
}

export interface PinOptions {
  home: string
  clis?: readonly string[]
  which(name: string): Promise<string | null>
  version(path: string): Promise<string | undefined>
}

export interface CheckOptions extends PinOptions {
  lock: BridgesLock
}

export interface EntryStatus {
  cli: string
  path: string | null
  status: "ok" | "drift" | "missing" | "unpinned"
  expectedSha?: string
  actualSha?: string
}

function lockPath(home: string): string {
  return join(home, "bridges.lock")
}

async function sha256File(path: string): Promise<string> {
  const buf = await readFile(path)
  return createHash("sha256").update(buf).digest("hex")
}

async function defaultVersion(path: string): Promise<string | undefined> {
  try {
    const proc = Bun.spawn([path, "--version"], { stdout: "pipe", stderr: "pipe" })
    const out = await new Response(proc.stdout).text()
    await proc.exited
    return out.trim().split("\n")[0]
  } catch {
    return undefined
  }
}

function applyPath(binDir: string | undefined): {
  which(name: string): Promise<string | null>
} {
  if (!binDir) {
    return {
      async which(name: string) {
        return Bun.which(name) ?? null
      },
    }
  }
  return {
    async which(name: string) {
      const candidate = join(binDir, name)
      try {
        await readFile(candidate)
        return candidate
      } catch {
        return null
      }
    },
  }
}

export async function pinBridges(opts: PinOptions): Promise<BridgesLock> {
  const clis = opts.clis ?? DEFAULT_BRIDGE_CLIS
  const entries: BridgeLockEntry[] = []
  for (const cli of clis) {
    const path = await opts.which(cli)
    if (!path) continue
    const sha256 = await sha256File(path)
    const version = await opts.version(path)
    entries.push({
      cli: cli as BridgeCli,
      path,
      sha256,
      version,
      pinnedAt: Date.now(),
    })
  }
  const lock: BridgesLock = { version: 1, entries }
  await mkdir(opts.home, { recursive: true })
  await writeFile(lockPath(opts.home), `${JSON.stringify(lock, null, 2)}\n`, "utf8")
  return lock
}

export async function loadBridgesLock(home: string): Promise<BridgesLock | null> {
  try {
    const raw = await readFile(lockPath(home), "utf8")
    const parsed = JSON.parse(raw) as BridgesLock
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return null
    return parsed
  } catch {
    return null
  }
}

export async function checkBridges(opts: CheckOptions): Promise<EntryStatus[]> {
  const result: EntryStatus[] = []
  for (const expected of opts.lock.entries) {
    const path = await opts.which(expected.cli)
    if (!path) {
      result.push({
        cli: expected.cli,
        path: null,
        status: "missing",
        expectedSha: expected.sha256,
      })
      continue
    }
    const sha = await sha256File(path)
    if (sha !== expected.sha256) {
      result.push({
        cli: expected.cli,
        path,
        status: "drift",
        expectedSha: expected.sha256,
        actualSha: sha,
      })
      continue
    }
    result.push({
      cli: expected.cli,
      path,
      status: "ok",
      expectedSha: expected.sha256,
      actualSha: sha,
    })
  }
  return result.sort((a, b) => a.cli.localeCompare(b.cli))
}

function overallStatus(entries: EntryStatus[]): "ok" | "drift" | "missing" {
  if (entries.some((e) => e.status === "drift")) return "drift"
  if (entries.some((e) => e.status === "missing")) return "missing"
  return "ok"
}

export function makeDoctorCommand(): CommandDef {
  return {
    name: "doctor",
    describe: "Check CLI bridge binaries against ~/.devclaw/bridges.lock (SHA256 pin)",
    usage: "devclaw doctor [--pin] [--json] [--home <dir>] [--path <bin-dir>]",
    flags: [
      { name: "pin", describe: "Write bridges.lock with current binaries + SHA256", type: "boolean" },
      { name: "json", describe: "Emit machine-readable JSON", type: "boolean" },
      { name: "home", describe: "Override ~/.devclaw (default: $HOME/.devclaw)" },
      { name: "path", describe: "Resolve bridges from this directory instead of PATH" },
    ],
    async handler({ args, stdout, stderr }) {
      const home =
        (typeof args.flags.home === "string" && args.flags.home) ||
        join(homedir(), ".devclaw")
      const pathOverride = typeof args.flags.path === "string" ? args.flags.path : undefined
      const whicher = applyPath(pathOverride)
      const pinOpts: PinOptions = {
        home,
        which: whicher.which,
        version: defaultVersion,
      }

      if (args.flags.pin) {
        const lock = await pinBridges(pinOpts)
        if (args.flags.json) {
          stdout(JSON.stringify({ status: "pinned", entries: lock.entries }, null, 2))
          return 0
        }
        stdout(`pinned ${lock.entries.length} bridge(s) in ${lockPath(home)}`)
        for (const e of lock.entries) {
          stdout(`  ${e.cli.padEnd(8)} ${e.sha256.slice(0, 12)}…  ${e.path}`)
        }
        return 0
      }

      const lock = await loadBridgesLock(home)
      if (!lock) {
        stderr(`no bridges.lock in ${home} — run 'devclaw doctor --pin' first`)
        return 2
      }
      const statuses = await checkBridges({ ...pinOpts, lock })
      const overall = overallStatus(statuses)

      if (args.flags.json) {
        stdout(JSON.stringify({ status: overall, entries: statuses }, null, 2))
        return overall === "ok" ? 0 : 1
      }

      stdout(`devclaw doctor — ${overall.toUpperCase()}`)
      for (const s of statuses) {
        const label = s.status.padEnd(8)
        if (s.status === "drift") {
          stdout(
            `  DRIFT   ${s.cli.padEnd(8)} expected=${s.expectedSha?.slice(0, 12)}… actual=${s.actualSha?.slice(0, 12)}… (${s.path})`,
          )
          continue
        }
        stdout(`  ${label} ${s.cli.padEnd(8)} ${s.actualSha?.slice(0, 12) ?? "-"}  ${s.path ?? ""}`)
      }
      if (overall === "drift") {
        stderr("drift detected — re-confirm with 'devclaw doctor --pin' after verifying binaries")
      }
      return overall === "ok" ? 0 : 1
    },
  }
}
