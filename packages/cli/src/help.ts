import type { Colorizer } from "./color.ts"
import type { CommandDef } from "./registry.ts"

export interface HelpFormatterConfig {
  binName: string
  colorizer: Colorizer
}

export function formatGlobalHelp(cfg: HelpFormatterConfig, commands: CommandDef[]): string {
  const lines: string[] = []
  lines.push(`${cfg.colorizer.bold(cfg.binName)} — autonomous developer toolkit`)
  lines.push("")
  lines.push(cfg.colorizer("gray", "Usage:"))
  lines.push(`  ${cfg.binName} <command> [...flags]`)
  lines.push("")
  lines.push(cfg.colorizer.bold("Commands:"))
  const width = commands.reduce((n, c) => Math.max(n, c.name.length), 0)
  for (const cmd of commands.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`  ${cmd.name.padEnd(width)}  ${cfg.colorizer.dim(cmd.describe)}`)
  }
  lines.push("")
  lines.push(cfg.colorizer.dim(`Run '${cfg.binName} help <command>' for details.`))
  return lines.join("\n")
}

export function formatCommandHelp(cfg: HelpFormatterConfig, cmd: CommandDef): string {
  const lines: string[] = []
  lines.push(cfg.colorizer.bold(`${cfg.binName} ${cmd.name}`))
  if (cmd.describe) lines.push(cfg.colorizer.dim(cmd.describe))
  if (cmd.usage) {
    lines.push("")
    lines.push(cfg.colorizer("gray", "Usage:"))
    lines.push(`  ${cmd.usage}`)
  }
  if (cmd.flags && cmd.flags.length > 0) {
    lines.push("")
    lines.push(cfg.colorizer.bold("Flags:"))
    const width = cmd.flags.reduce((n, f) => Math.max(n, f.name.length), 0)
    for (const flag of cmd.flags) {
      lines.push(`  --${flag.name.padEnd(width)}  ${cfg.colorizer.dim(flag.describe ?? "")}`)
    }
  }
  return lines.join("\n")
}
