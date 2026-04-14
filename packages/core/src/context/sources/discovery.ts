import { type DiscoverOpts, type DiscoveryReport, discover } from "../../discovery/discover.ts"
import type { ContextItem, ContextSource } from "../types.ts"

export interface DiscoverySourceConfig {
  id?: string
  rootDir: string
  opts?: DiscoverOpts
  refresh?: boolean
}

export class DiscoverySource implements ContextSource {
  readonly id: string
  private readonly rootDir: string
  private readonly opts?: DiscoverOpts
  private cached: DiscoveryReport | null = null
  private refresh: boolean

  constructor(cfg: DiscoverySourceConfig) {
    this.id = cfg.id ?? "discovery"
    this.rootDir = cfg.rootDir
    this.opts = cfg.opts
    this.refresh = cfg.refresh ?? false
  }

  async collect(): Promise<ContextItem[]> {
    if (!this.cached || this.refresh) {
      this.cached = await discover(this.rootDir, this.opts)
    }
    const report = this.cached
    const items: ContextItem[] = []
    const stack = report.stack
    if (stack.languages.length > 0) {
      items.push({
        id: "stack.languages",
        sourceId: this.id,
        kind: "data",
        content: `Languages: ${stack.languages.map((d) => d.id).join(", ")}`,
      })
    }
    if (stack.frameworks.length > 0) {
      items.push({
        id: "stack.frameworks",
        sourceId: this.id,
        kind: "data",
        content: `Frameworks: ${stack.frameworks.map((d) => d.id).join(", ")}`,
      })
    }
    if (stack.testRunners.length > 0) {
      items.push({
        id: "stack.testRunners",
        sourceId: this.id,
        kind: "data",
        content: `Test runners: ${stack.testRunners.map((d) => d.id).join(", ")}`,
      })
    }
    const cliLines = Object.entries(report.clis)
      .filter(([, info]) => info.available)
      .map(([name, info]) => `${name}${info.version ? ` ${info.version}` : ""}`)
    if (cliLines.length > 0) {
      items.push({
        id: "clis",
        sourceId: this.id,
        kind: "data",
        content: `Available CLIs: ${cliLines.join(", ")}`,
      })
    }
    const conv = report.conventions
    const convFields = [
      conv.linter && `linter=${conv.linter}`,
      conv.formatter && `formatter=${conv.formatter}`,
      conv.commitConvention && `commits=${conv.commitConvention}`,
      conv.testLocation && `tests=${conv.testLocation}`,
    ].filter((x): x is string => Boolean(x))
    if (convFields.length > 0) {
      items.push({
        id: "conventions",
        sourceId: this.id,
        kind: "data",
        content: `Project conventions: ${convFields.join(", ")}`,
      })
    }
    return items
  }
}
