import { EventEmitter } from "../util/event_emitter.ts"
import type { Tool } from "./types.ts"

export interface ToolRegistryEvents extends Record<string, unknown> {
  registered: { id: string; tool: Tool }
  replaced: { id: string; tool: Tool; previous: Tool }
  removed: { id: string; tool: Tool }
}

export class ToolRegistry {
  private tools = new Map<string, Tool>()
  readonly events = new EventEmitter<ToolRegistryEvents>()

  register<I, O>(tool: Tool<I, O>): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`tool ${tool.id} already registered; use replace() to swap`)
    }
    this.tools.set(tool.id, tool as Tool)
    this.events.emit("registered", { id: tool.id, tool: tool as Tool })
  }

  replace<I, O>(tool: Tool<I, O>): void {
    const previous = this.tools.get(tool.id)
    if (!previous) {
      throw new Error(`tool ${tool.id} not registered; use register() to add`)
    }
    this.tools.set(tool.id, tool as Tool)
    this.events.emit("replaced", { id: tool.id, tool: tool as Tool, previous })
  }

  unregister(id: string): void {
    const tool = this.tools.get(id)
    if (!tool) return
    this.tools.delete(id)
    this.events.emit("removed", { id, tool })
  }

  has(id: string): boolean {
    return this.tools.has(id)
  }

  get(id: string): Tool {
    const tool = this.tools.get(id)
    if (!tool) throw new Error(`tool ${id} not registered`)
    return tool
  }

  list(): Tool[] {
    return [...this.tools.values()]
  }
}
