#!/usr/bin/env bun
import { createColorizer } from "./color.ts"
import { makeAuthCommand } from "./commands/auth.ts"
import { makeConsensusCommand } from "./commands/consensus.ts"
import { makeDiscoverCommand } from "./commands/discover.ts"
import { makeDoctorCommand } from "./commands/doctor.ts"
import { makeInitCommand } from "./commands/init.ts"
import { makeInvokeCommand } from "./commands/invoke.ts"
import { makeBridgesCommand, makeProvidersCommand } from "./commands/providers.ts"
import { makeSlashCommand } from "./commands/slash.ts"
import { makeVersionCommand } from "./commands/version.ts"
import { formatCommandHelp, formatGlobalHelp } from "./help.ts"
import { parseArgs } from "./parser.ts"
import { CommandRegistry, type RunContext } from "./registry.ts"
import { createRuntime, type Runtime } from "./runtime.ts"

const VERSION = "0.0.0"
const BIN = "devclaw"

export function buildRegistry(lazyRuntime: () => Promise<Runtime>): CommandRegistry {
  const reg = new CommandRegistry()
  reg.register(makeVersionCommand(VERSION))
  reg.register(makeDiscoverCommand())
  reg.register(makeInitCommand())
  reg.register(makeAuthCommand(async () => (await lazyRuntime()).authStore))
  reg.register(makeProvidersCommand(async () => (await lazyRuntime()).catalog))
  reg.register(makeBridgesCommand(async () => (await lazyRuntime()).bridges))
  reg.register(makeInvokeCommand(async () => (await lazyRuntime()).fallback))
  reg.register(makeSlashCommand(lazyRuntime))
  reg.register(makeConsensusCommand(lazyRuntime))
  reg.register(makeDoctorCommand())
  return reg
}

export interface RunOpts {
  argv?: string[]
  stdout?: (text: string) => void
  stderr?: (text: string) => void
  runtime?: () => Promise<Runtime>
}

export async function run(opts: RunOpts = {}): Promise<number> {
  const argv = opts.argv ?? process.argv.slice(2)
  const stdout = opts.stdout ?? ((t) => process.stdout.write(`${t}\n`))
  const stderr = opts.stderr ?? ((t) => process.stderr.write(`${t}\n`))
  const args = parseArgs(argv)
  const colorizer = createColorizer()
  let cached: Runtime | null = null
  const lazyRuntime =
    opts.runtime ??
    (async () => {
      if (!cached) cached = await createRuntime()
      return cached
    })
  const registry = buildRegistry(lazyRuntime)

  if (args.command === "" || args.command === "help") {
    const target = args.positional[0]
    if (target) {
      const cmd = registry.get(target)
      if (!cmd) {
        stderr(`unknown command: ${target}`)
        return 2
      }
      stdout(formatCommandHelp({ binName: BIN, colorizer }, cmd))
      return 0
    }
    stdout(formatGlobalHelp({ binName: BIN, colorizer }, registry.list()))
    return 0
  }

  const cmd = registry.get(args.command)
  if (!cmd) {
    stderr(`unknown command: ${args.command}`)
    stderr(`run '${BIN} help' for a list of commands`)
    return 2
  }

  const ctx: RunContext = { args, stdout, stderr }
  try {
    return await cmd.handler(ctx)
  } catch (err) {
    stderr(err instanceof Error ? err.message : String(err))
    return 1
  }
}

if (import.meta.main) {
  run()
    .then((code) => {
      process.exit(code)
    })
    .catch((err) => {
      process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
      process.exit(1)
    })
}
