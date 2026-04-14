import type { AuditLog } from "../auth/audit.ts"
import { GateBlockedError } from "./errors.ts"
import type { GateCheck, GateContext, GateType } from "./types.ts"

export interface GateManagerConfig {
  checks?: Partial<Record<GateType, GateCheck[]>>
  audit?: AuditLog
}

export class GateManager {
  private readonly checks: Map<GateType, GateCheck[]>
  private readonly overrides = new Map<string, { reason: string; actor: string; at: number }>()
  private readonly audit?: AuditLog

  constructor(cfg: GateManagerConfig = {}) {
    this.checks = new Map(
      Object.entries(cfg.checks ?? {}).map(([k, v]) => [k as GateType, v ?? []]),
    )
    this.audit = cfg.audit
  }

  addCheck(gate: GateType, check: GateCheck): void {
    const existing = this.checks.get(gate) ?? []
    existing.push(check)
    this.checks.set(gate, existing)
  }

  async ensure(ctx: GateContext): Promise<void> {
    const key = this.overrideKey(ctx)
    const override = this.overrides.get(key)
    if (override) {
      this.overrides.delete(key)
      await this.auditOverride(ctx, override)
      return
    }
    const checks = this.checks.get(ctx.gate) ?? []
    const reasons: string[] = []
    for (const check of checks) {
      const result = await check(ctx)
      if (!result.ok) reasons.push(...(result.reasons ?? ["check failed"]))
    }
    if (reasons.length > 0) {
      await this.auditBlocked(ctx, reasons)
      throw new GateBlockedError(ctx.gate, reasons)
    }
    await this.auditPassed(ctx)
  }

  override(gate: GateType, actor: string, reason: string, scope?: string): void {
    this.overrides.set(this.overrideKey({ gate, actor, scope }), {
      reason,
      actor,
      at: Date.now(),
    })
  }

  private overrideKey(ctx: { gate: GateType; actor: string; scope?: string }): string {
    return `${ctx.gate}::${ctx.actor}::${ctx.scope ?? ""}`
  }

  private async auditPassed(ctx: GateContext): Promise<void> {
    if (!this.audit) return
    await this.audit.append({
      event: "auth.list",
      provider: `gate.${ctx.gate}`,
      accountId: ctx.actor,
      meta: this.meta(ctx, { result: "passed" }),
    })
  }

  private async auditBlocked(ctx: GateContext, reasons: string[]): Promise<void> {
    if (!this.audit) return
    await this.audit.append({
      event: "auth.refresh.fail",
      provider: `gate.${ctx.gate}`,
      accountId: ctx.actor,
      meta: this.meta(ctx, { result: "blocked", reasons: reasons.join(" | ") }),
    })
  }

  private async auditOverride(
    ctx: GateContext,
    override: { reason: string; actor: string },
  ): Promise<void> {
    if (!this.audit) return
    await this.audit.append({
      event: "auth.refresh.success",
      provider: `gate.${ctx.gate}`,
      accountId: ctx.actor,
      meta: this.meta(ctx, { result: "overridden", reason: override.reason }),
    })
  }

  private meta(ctx: GateContext, extra: Record<string, string>): Record<string, string> {
    const base: Record<string, string> = { ...extra }
    if (ctx.scope) base.scope = ctx.scope
    return base
  }
}
