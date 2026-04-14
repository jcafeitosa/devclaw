import type { ParsedArgs } from "./parser.ts"

export interface CommandFlag {
  name: string
  describe?: string
  type?: "string" | "boolean" | "number"
  required?: boolean
}

export interface RunContext {
  args: ParsedArgs
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export interface CommandDef {
  name: string
  describe: string
  usage?: string
  flags?: CommandFlag[]
  handler(ctx: RunContext): Promise<number>
}

export class CommandRegistry {
  private readonly byName = new Map<string, CommandDef>()

  register(def: CommandDef): void {
    if (this.byName.has(def.name)) {
      throw new Error(`command ${def.name} already registered`)
    }
    this.byName.set(def.name, def)
  }

  get(name: string): CommandDef | undefined {
    return this.byName.get(name)
  }

  list(): CommandDef[] {
    return [...this.byName.values()]
  }
}
