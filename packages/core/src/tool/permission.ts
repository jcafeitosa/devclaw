import type { Tool, ToolInvocationCtx } from "./types.ts"

export type Decision = "allow" | "deny"

export interface ApprovalRequest {
  tool: Tool
  input: unknown
  ctx: ToolInvocationCtx
}

export type Approver = (req: ApprovalRequest) => Promise<Decision>

export interface PermissionCheckerConfig {
  allow?: string[]
  deny?: string[]
  approve?: Approver
}

export class PermissionChecker {
  private readonly allow: Set<string>
  private readonly deny: Set<string>
  private readonly approve?: Approver
  private readonly wildcardAllow: boolean

  constructor(cfg: PermissionCheckerConfig) {
    this.allow = new Set(cfg.allow ?? [])
    this.deny = new Set(cfg.deny ?? [])
    this.approve = cfg.approve
    this.wildcardAllow = this.allow.has("*")
  }

  async check(tool: Tool, input: unknown, ctx: ToolInvocationCtx): Promise<Decision> {
    if (this.deny.has(tool.id)) return "deny"
    if (tool.risk === "critical") {
      if (!this.approve) return "deny"
      return this.approve({ tool, input, ctx })
    }
    if (tool.risk === "low" || tool.risk === "medium") return "allow"
    if (this.wildcardAllow || this.allow.has(tool.id)) return "allow"
    if (!this.approve) return "deny"
    return this.approve({ tool, input, ctx })
  }
}
