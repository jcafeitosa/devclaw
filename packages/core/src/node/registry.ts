import { DuplicateNodeError, NodeNotFoundError } from "./errors.ts"
import type { Node, NodeStatus } from "./types.ts"

export { DuplicateNodeError, NodeNotFoundError } from "./errors.ts"

export class NodeRegistry {
  private readonly nodes = new Map<string, Node>()

  register(node: Node): void {
    if (this.nodes.has(node.id)) throw new DuplicateNodeError(node.id)
    this.nodes.set(node.id, { ...node })
  }

  unregister(id: string): void {
    this.nodes.delete(id)
  }

  get(id: string): Node {
    const n = this.nodes.get(id)
    if (!n) throw new NodeNotFoundError(id)
    return n
  }

  list(): Node[] {
    return [...this.nodes.values()]
  }

  setStatus(id: string, status: NodeStatus): void {
    const n = this.get(id)
    n.status = status
  }

  findByCapability(cap: string, opts: { includeOffline?: boolean } = {}): Node[] {
    return this.list().filter((n) => {
      if (!n.capabilities.includes(cap)) return false
      if (opts.includeOffline) return true
      return n.status === "online" || n.status === "degraded"
    })
  }
}
