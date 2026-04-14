import { TerminalNotFoundError } from "./errors.ts"
import { TerminalSession } from "./session.ts"
import type { TerminalStartOptions } from "./types.ts"

export { TerminalNotFoundError } from "./errors.ts"

export class TerminalRegistry {
  private readonly sessions = new Map<string, TerminalSession>()

  async create(opts: TerminalStartOptions): Promise<string> {
    const id = `term_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    const s = new TerminalSession()
    s.events.on("exit", () => this.sessions.delete(id))
    await s.start(opts)
    this.sessions.set(id, s)
    return id
  }

  get(id: string): TerminalSession {
    const s = this.sessions.get(id)
    if (!s) throw new TerminalNotFoundError(id)
    return s
  }

  list(): string[] {
    return [...this.sessions.keys()]
  }

  async close(id: string): Promise<void> {
    const s = this.sessions.get(id)
    if (!s) return
    s.kill("SIGKILL")
    this.sessions.delete(id)
  }
}
