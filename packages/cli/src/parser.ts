export interface ParsedArgs {
  command: string
  positional: string[]
  flags: Record<string, string | boolean>
}

export interface ParseOptions {
  shortMap?: Record<string, string>
}

export function parseArgs(argv: string[], opts: ParseOptions = {}): ParsedArgs {
  const shortMap = opts.shortMap ?? {}
  const positional: string[] = []
  const flags: Record<string, string | boolean> = {}
  let command = ""
  let i = 0

  if (argv[0] && !argv[0].startsWith("-")) {
    command = argv[0]
    i = 1
  }

  let terminated = false
  for (; i < argv.length; i++) {
    const arg = argv[i]!
    if (terminated) {
      positional.push(arg)
      continue
    }
    if (arg === "--") {
      terminated = true
      continue
    }
    if (arg.startsWith("--no-")) {
      const key = arg.slice(5)
      flags[key] = false
      continue
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2)
      const eq = body.indexOf("=")
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1)
      } else {
        const key = body
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith("-")) {
          flags[key] = next
          i++
        } else {
          flags[key] = true
        }
      }
      continue
    }
    if (arg.startsWith("-") && arg.length > 1) {
      const short = arg.slice(1)
      const key = shortMap[short] ?? short
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
      continue
    }
    positional.push(arg)
  }

  return { command, positional, flags }
}
