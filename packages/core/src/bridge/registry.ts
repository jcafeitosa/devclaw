import type { Bridge, BridgeRequest, Capabilities } from "./types.ts"

export class BridgeRegistry {
  private readonly bridges = new Map<string, Bridge>()

  register(bridge: Bridge): void {
    if (this.bridges.has(bridge.cli)) {
      throw new Error(`bridge ${bridge.cli} already registered`)
    }
    this.bridges.set(bridge.cli, bridge)
  }

  replace(bridge: Bridge): void {
    this.bridges.set(bridge.cli, bridge)
  }

  unregister(cli: string): void {
    this.bridges.delete(cli)
  }

  has(cli: string): boolean {
    return this.bridges.has(cli)
  }

  get(cli: string): Bridge | undefined {
    return this.bridges.get(cli)
  }

  list(): Bridge[] {
    return [...this.bridges.values()]
  }

  async select(request: BridgeRequest): Promise<Bridge | null> {
    const bridge = this.bridges.get(request.cli)
    if (!bridge) return null
    if (!(await bridge.isAvailable())) return null
    const auth = await bridge.isAuthenticated()
    if (!auth.authed) return null
    return bridge
  }

  async selectByCapability(
    request: BridgeRequest,
    predicate: (cap: Capabilities) => boolean,
  ): Promise<Bridge | null> {
    const candidates: Array<{ bridge: Bridge; cost: number }> = []
    for (const bridge of this.bridges.values()) {
      if (!predicate(bridge.capabilities())) continue
      if (!(await bridge.isAvailable())) continue
      const auth = await bridge.isAuthenticated()
      if (!auth.authed) continue
      const cost = bridge.estimateCost(request).costUsd
      candidates.push({ bridge, cost })
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => a.cost - b.cost || a.bridge.cli.localeCompare(b.bridge.cli))
    return candidates[0]?.bridge ?? null
  }
}
