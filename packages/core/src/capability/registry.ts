import { CapabilityNotFoundError, CapabilityUnavailableError } from "./errors.ts"
import type { Capability, CapabilityGrant } from "./types.ts"

export { CapabilityNotFoundError, CapabilityUnavailableError } from "./errors.ts"

export interface CapabilityRegistryConfig {
  hasRuntime?: (kind: string) => boolean
  hasDevice?: (kind: string) => boolean
  hasTool?: (id: string) => boolean
  prompt?: (id: string, reason?: string) => Promise<boolean>
}

export interface RequestOptions {
  reason?: string
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>()
  private readonly cfg: CapabilityRegistryConfig

  constructor(cfg: CapabilityRegistryConfig = {}) {
    this.cfg = cfg
  }

  register(cap: Capability): void {
    this.capabilities.set(cap.id, { ...cap, requires: { ...cap.requires } })
  }

  unregister(id: string): void {
    this.capabilities.delete(id)
  }

  get(id: string): Capability {
    const c = this.capabilities.get(id)
    if (!c) throw new CapabilityNotFoundError(id)
    return c
  }

  list(): Capability[] {
    return [...this.capabilities.values()]
  }

  async isAvailable(id: string): Promise<boolean> {
    const c = this.get(id)
    return this.depsSatisfied(c)
  }

  async listAvailable(): Promise<Capability[]> {
    const out: Capability[] = []
    for (const c of this.capabilities.values()) {
      if (await this.depsSatisfied(c)) out.push(c)
    }
    return out
  }

  async request(id: string, opts: RequestOptions = {}): Promise<CapabilityGrant> {
    const c = this.get(id)
    if (c.permission === "denied") {
      throw new CapabilityUnavailableError(id, "permission=denied")
    }
    if (!(await this.depsSatisfied(c))) {
      throw new CapabilityUnavailableError(id, "dependencies not satisfied")
    }
    if (c.permission === "prompt") {
      const decision = (await this.cfg.prompt?.(id, opts.reason)) ?? false
      if (!decision) throw new CapabilityUnavailableError(id, "prompt denied")
      return { capabilityId: id, granted: true, via: "prompt", at: Date.now() }
    }
    return { capabilityId: id, granted: true, via: "auto", at: Date.now() }
  }

  private async depsSatisfied(c: Capability): Promise<boolean> {
    for (const k of c.requires.runtimes ?? []) {
      if (!this.cfg.hasRuntime?.(k)) return false
    }
    for (const k of c.requires.devices ?? []) {
      if (!this.cfg.hasDevice?.(k)) return false
    }
    for (const k of c.requires.tools ?? []) {
      if (!this.cfg.hasTool?.(k)) return false
    }
    return true
  }
}
