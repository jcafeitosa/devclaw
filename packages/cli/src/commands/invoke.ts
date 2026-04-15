import type { FallbackStrategy } from "@devclaw/core/bridge"
import type { CommandDef } from "../registry.ts"

export function makeInvokeCommand(getFallback: () => Promise<FallbackStrategy>): CommandDef {
  return {
    name: "invoke",
    describe: "Execute a prompt via bridge with API fallback",
    usage: 'devclaw invoke --prompt "..." [--cli claude] [--task task-id]',
    flags: [
      { name: "prompt", describe: "Prompt text", required: true },
      { name: "cli", describe: "Preferred CLI bridge (claude/codex/gemini/aider)" },
      { name: "task", describe: "Task id (default: generated)" },
      { name: "json", describe: "Stream events as JSON" },
    ],
    async handler({ args, stdout, stderr }) {
      const prompt =
        typeof args.flags.prompt === "string" && args.flags.prompt.length > 0
          ? args.flags.prompt
          : args.positional[0]
      if (!prompt) {
        stderr("missing --prompt")
        return 2
      }
      const cli = (typeof args.flags.cli === "string" ? args.flags.cli : "claude") as
        | "claude"
        | "codex"
        | "gemini"
        | "aider"
      const taskId =
        (typeof args.flags.task === "string" && args.flags.task) || `task_${Date.now()}`
      const sessionId = `session_${Date.now()}`
      const fallback = await getFallback()
      const events = fallback.execute({
        taskId,
        sessionId,
        agentId: "cli",
        cli,
        cwd: process.cwd(),
        prompt,
      })
      let exitCode = 0
      for await (const event of events) {
        if (args.flags.json) {
          stdout(JSON.stringify(event))
          continue
        }
        if (event.type === "text") stdout(event.content)
        else if (event.type === "thought") stdout(`[thought] ${event.content}`)
        else if (event.type === "error") {
          stderr(`[error] ${event.message}`)
          exitCode = 1
        }
      }
      return exitCode
    },
  }
}
