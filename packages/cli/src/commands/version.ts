import type { CommandDef } from "../registry.ts"

export function makeVersionCommand(version: string): CommandDef {
  return {
    name: "version",
    describe: "Print CLI version",
    async handler({ stdout }) {
      stdout(version)
      return 0
    },
  }
}
