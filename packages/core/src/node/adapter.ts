import type { NodeRegistry } from "./registry.ts"
import type { Node } from "./types.ts"

export interface NodeExecuteOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface CapabilityHandlerContext {
  signal: AbortSignal
}

export type CapabilityHandler = (
  args: unknown,
  ctx: CapabilityHandlerContext,
) => Promise<unknown> | unknown

export type SubscribeUnsub = () => void

export interface NodeAdapter {
  advertise(): Node
  execute(capability: string, args: unknown, opts?: NodeExecuteOptions): Promise<unknown>
  subscribe(topic: string, cb: (payload: unknown) => void): SubscribeUnsub
}

export class CapabilityUnsupportedError extends Error {
  readonly nodeId: string
  readonly capability: string
  constructor(nodeId: string, capability: string) {
    super(`node '${nodeId}' does not support capability '${capability}'`)
    this.name = "CapabilityUnsupportedError"
    this.nodeId = nodeId
    this.capability = capability
  }
}

export interface LocalNodeAdapterConfig {
  node: Node
  capabilities: Record<string, CapabilityHandler>
}

export class LocalNodeAdapter implements NodeAdapter {
  private readonly node: Node
  private readonly capabilities: Record<string, CapabilityHandler>
  private readonly subscribers = new Map<string, Set<(payload: unknown) => void>>()

  constructor(cfg: LocalNodeAdapterConfig) {
    const declared = Object.keys(cfg.capabilities)
    this.node = {
      ...cfg.node,
      capabilities: Array.from(new Set([...cfg.node.capabilities, ...declared])),
    }
    this.capabilities = cfg.capabilities
  }

  advertise(): Node {
    return { ...this.node, capabilities: [...this.node.capabilities] }
  }

  async execute(
    capability: string,
    args: unknown,
    opts: NodeExecuteOptions = {},
  ): Promise<unknown> {
    const handler = this.capabilities[capability]
    if (!handler) throw new CapabilityUnsupportedError(this.node.id, capability)
    const signal = opts.signal ?? new AbortController().signal
    return handler(args, { signal })
  }

  subscribe(topic: string, cb: (payload: unknown) => void): SubscribeUnsub {
    let set = this.subscribers.get(topic)
    if (!set) {
      set = new Set()
      this.subscribers.set(topic, set)
    }
    set.add(cb)
    return () => {
      set?.delete(cb)
    }
  }

  publish(topic: string, payload: unknown): void {
    const set = this.subscribers.get(topic)
    if (!set) return
    for (const cb of set) cb(payload)
  }
}

export class NodeAdapterRegistry {
  private readonly adapters = new Map<string, NodeAdapter>()

  bind(nodeId: string, adapter: NodeAdapter): void {
    this.adapters.set(nodeId, adapter)
  }

  unbind(nodeId: string): void {
    this.adapters.delete(nodeId)
  }

  get(nodeId: string): NodeAdapter {
    const a = this.adapters.get(nodeId)
    if (!a) throw new Error(`adapter not bound for node '${nodeId}'`)
    return a
  }

  list(): string[] {
    return [...this.adapters.keys()]
  }

  async execute(
    nodeId: string,
    capability: string,
    args: unknown,
    opts?: NodeExecuteOptions,
  ): Promise<unknown> {
    return this.get(nodeId).execute(capability, args, opts)
  }

  syncTo(registry: NodeRegistry): void {
    for (const [id, adapter] of this.adapters) {
      const node = adapter.advertise()
      try {
        registry.get(id)
        registry.unregister(id)
      } catch {
        // not previously registered
      }
      registry.register(node)
    }
  }
}
