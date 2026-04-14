import type { NodeRegistry } from "./registry.ts"
import type { Node } from "./types.ts"

export type HealthProbe = (node: Node) => Promise<boolean>

export interface HealthMonitorConfig {
  probe: HealthProbe
  failureThreshold?: number
}

export class HealthMonitor {
  private readonly probe: HealthProbe
  private readonly threshold: number
  private readonly failures = new Map<string, number>()

  constructor(
    private readonly registry: NodeRegistry,
    cfg: HealthMonitorConfig,
  ) {
    this.probe = cfg.probe
    this.threshold = cfg.failureThreshold ?? 3
  }

  async checkAll(): Promise<void> {
    await Promise.all(this.registry.list().map((n) => this.checkOne(n)))
  }

  private async checkOne(node: Node): Promise<void> {
    if (node.kind === "local") {
      this.failures.delete(node.id)
      this.registry.setStatus(node.id, "online")
      return
    }
    const ok = await this.probe(node)
    if (ok) {
      this.failures.delete(node.id)
      this.registry.setStatus(node.id, "online")
      return
    }
    const next = (this.failures.get(node.id) ?? 0) + 1
    this.failures.set(node.id, next)
    this.registry.setStatus(node.id, next >= this.threshold ? "offline" : "degraded")
  }
}
