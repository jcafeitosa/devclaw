import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import type { CommandDef } from "../registry.ts"

const DEFAULT_CONFIG = {
  version: 1,
  defaultProvider: "anthropic",
  bridges: ["claude", "codex", "gemini", "aider"],
  discovery: { cache: false },
}

export function makeInitCommand(): CommandDef {
  return {
    name: "init",
    describe: "Create devclaw.json and .devclaw/ in project dir",
    usage: "devclaw init [dir]",
    async handler({ args, stdout }) {
      const dir = args.positional[0] ?? process.cwd()
      const configPath = join(dir, "devclaw.json")
      const hidden = join(dir, ".devclaw")
      await mkdir(hidden, { recursive: true, mode: 0o700 })
      const file = Bun.file(configPath)
      if (!(await file.exists())) {
        await Bun.write(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`)
        stdout(`created ${configPath}`)
      } else {
        stdout(`skipped ${configPath} (already exists)`)
      }
      stdout(`created ${hidden}`)
      return 0
    },
  }
}
