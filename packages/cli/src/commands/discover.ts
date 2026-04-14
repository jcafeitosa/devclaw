import { discover } from "@devclaw/core/discovery"
import type { CommandDef } from "../registry.ts"

export function makeDiscoverCommand(): CommandDef {
  return {
    name: "discover",
    describe: "Detect project stack, CLIs, conventions",
    usage: "devclaw discover [dir] [--json]",
    flags: [{ name: "json", describe: "Output machine-readable JSON" }],
    async handler({ args, stdout }) {
      const dir = args.positional[0] ?? process.cwd()
      const report = await discover(dir)
      if (args.flags.json) {
        stdout(JSON.stringify(report, null, 2))
        return 0
      }
      const lines: string[] = []
      lines.push(`Project: ${report.projectRoot}`)
      lines.push(`Scanned: ${report.scannedAt}`)
      lines.push("")
      lines.push(`Languages:  ${report.stack.languages.map((d) => d.id).join(", ")}`)
      lines.push(`Runtimes:   ${report.stack.runtimes.map((d) => d.id).join(", ")}`)
      lines.push(`Frameworks: ${report.stack.frameworks.map((d) => d.id).join(", ")}`)
      lines.push(`Tests:      ${report.stack.testRunners.map((d) => d.id).join(", ")}`)
      lines.push("")
      lines.push("CLIs:")
      for (const [name, info] of Object.entries(report.clis)) {
        lines.push(
          `  ${name.padEnd(8)} ${info.available ? "✓" : "—"}${info.version ? ` ${info.version}` : ""}`,
        )
      }
      lines.push("")
      const c = report.conventions
      lines.push(
        `Conventions: ${c.linter ?? "?"}/${c.formatter ?? "?"} · ${c.commitConvention ?? "?"} · ${c.testLocation ?? "?"}`,
      )
      stdout(lines.join("\n"))
      return 0
    },
  }
}
