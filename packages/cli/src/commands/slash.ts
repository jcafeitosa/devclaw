import type { CliId, FallbackStrategy } from "@devclaw/core/bridge"
import { registerBuiltinCommands } from "@devclaw/core/slash/builtins"
import { validateInvocation } from "@devclaw/core/slash/invocation"
import { SlashRegistry } from "@devclaw/core/slash/registry"
import type { CommandDef } from "../registry.ts"
import type { Runtime } from "../runtime.ts"

function renderTemplate(body: string, vars: Record<string, unknown>): string {
  return body.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_m, key: string) => {
    const parts = key.split(".")
    let cur: unknown = vars
    for (const part of parts) {
      if (cur == null || typeof cur !== "object") return ""
      cur = (cur as Record<string, unknown>)[part]
    }
    return cur == null ? "" : String(cur)
  })
}

function listBuiltins(registry: SlashRegistry): string {
  return registry
    .list()
    .map((def) => `/${def.name} - ${def.description ?? "slash command"}`)
    .sort()
    .join("\n")
}

async function runRendered(
  fallback: FallbackStrategy,
  name: string,
  prompt: string,
  cli: CliId,
  taskId: string,
  sessionId: string,
  cwd: string,
  stdout: (text: string) => void,
  stderr: (text: string) => void,
): Promise<number> {
  const events = fallback.execute({
    taskId,
    sessionId,
    agentId: "slash",
    cli,
    cwd,
    prompt,
  })
  let exitCode = 0
  stdout(`/${name}`)
  for await (const event of events) {
    if (event.type === "text") stdout(event.content)
    else if (event.type === "thought") stdout(`[thought] ${event.content}`)
    else if (event.type === "error") {
      stderr(`[error] ${event.message}`)
      exitCode = 1
    }
  }
  return exitCode
}

export function makeSlashCommand(getRuntime: () => Promise<Runtime>): CommandDef {
  return {
    name: "slash",
    describe: "List, render, or run built-in slash commands",
    usage: "devclaw slash --command tdd [--run] [--cli claude]",
    flags: [
      { name: "command", describe: "Slash command name (e.g. tdd, code-review)", required: false },
      { name: "run", describe: "Execute the rendered prompt via fallback", type: "boolean" },
      { name: "json", describe: "Emit JSON instead of text", type: "boolean" },
      { name: "cli", describe: "Bridge CLI to use when running" },
      { name: "task", describe: "Task id (default: generated)" },
      { name: "session", describe: "Session id (default: generated)" },
      { name: "list", describe: "List available slash commands", type: "boolean" },
    ],
    async handler({ args, stdout, stderr }) {
      const runtime = await getRuntime()
      const registry = new SlashRegistry()
      registerBuiltinCommands(registry)
      if (args.flags.list === true || typeof args.flags.command !== "string") {
        stdout(listBuiltins(registry))
        return 0
      }

      const name = args.flags.command.trim().replace(/^\/+/, "")
      const def = registry.get(name)
      const renderedFlags: Record<string, string | number | boolean> = {}
      for (const spec of def.args ?? []) {
        const direct = args.flags[spec.name]
        const dashed = args.flags[spec.name.replaceAll("_", "-")]
        const value = direct ?? dashed
        if (value !== undefined) renderedFlags[spec.name] = value
      }
      const values = validateInvocation(def, {
        name,
        positional: [],
        flags: renderedFlags,
      })
      const prompt = renderTemplate(def.body, {
        args: values,
        name: def.name,
      })
      const payload = {
        command: def.name,
        args: values,
        prompt,
      }
      if (args.flags.json === true) {
        stdout(JSON.stringify(payload, null, 2))
        return 0
      }
      if (args.flags.run === true) {
        const taskId =
          (typeof args.flags.task === "string" && args.flags.task) || `task_${Date.now()}`
        const sessionId =
          (typeof args.flags.session === "string" && args.flags.session) || `session_${Date.now()}`
        const cli = typeof args.flags.cli === "string" ? args.flags.cli : "claude"
        return await runRendered(
          runtime.fallback,
          def.name,
          prompt,
          cli,
          taskId,
          sessionId,
          process.cwd(),
          stdout,
          stderr,
        )
      }
      stdout(prompt)
      return 0
    },
  }
}
