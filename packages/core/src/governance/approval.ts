import { EventEmitter } from "../util/event_emitter.ts"
import { ApprovalRequestNotFoundError, GateNotRegisteredError } from "./errors.ts"
import type {
  ApprovalDecision,
  ApprovalGateKind,
  GovernanceApprovalRequest,
  OverrideRecord,
} from "./types.ts"

export interface GateDefinition {
  kind: ApprovalGateKind
  requiredApprovers: string[]
  description?: string
  autoApprove?: (request: GovernanceApprovalRequest) => boolean
}

export interface ApprovalSystemEvents extends Record<string, unknown> {
  approval_requested: { request: GovernanceApprovalRequest }
  approval_decided: { decision: ApprovalDecision }
  approval_overridden: { override: OverrideRecord }
}

export interface ApprovalSystemConfig {
  gates?: GateDefinition[]
  onAudit?: (entry: {
    kind: "request" | "decision" | "override"
    data: GovernanceApprovalRequest | ApprovalDecision | OverrideRecord
  }) => void
}

function nextId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

export class ApprovalGateSystem {
  readonly events = new EventEmitter<ApprovalSystemEvents>()
  private readonly gates = new Map<string, GateDefinition>()
  private readonly requests = new Map<string, GovernanceApprovalRequest>()
  private readonly decisions = new Map<string, ApprovalDecision>()
  private readonly overrides: OverrideRecord[] = []
  private readonly onAudit?: ApprovalSystemConfig["onAudit"]

  constructor(cfg: ApprovalSystemConfig = {}) {
    for (const gate of cfg.gates ?? []) this.registerGate(gate)
    this.onAudit = cfg.onAudit
  }

  registerGate(gate: GateDefinition): void {
    this.gates.set(gate.kind, gate)
  }

  listGates(): GateDefinition[] {
    return [...this.gates.values()]
  }

  request(input: Omit<GovernanceApprovalRequest, "id" | "createdAt">): GovernanceApprovalRequest {
    const gate = this.gates.get(input.gate)
    if (!gate) throw new GateNotRegisteredError(input.gate)
    const request: GovernanceApprovalRequest = {
      id: nextId("apr"),
      createdAt: Date.now(),
      ...input,
    }
    this.requests.set(request.id, request)
    this.events.emit("approval_requested", { request })
    this.onAudit?.({ kind: "request", data: request })

    if (gate.autoApprove?.(request)) {
      return this.approve(request.id, "system:auto", "auto-approved by gate rule")
        ? request
        : request
    }
    return request
  }

  approve(requestId: string, approver: string, reason?: string): ApprovalDecision {
    const request = this.must(requestId)
    const gate = this.gates.get(request.gate)
    if (!gate) throw new GateNotRegisteredError(request.gate)
    if (!gate.requiredApprovers.includes(approver) && approver !== "system:auto") {
      throw new Error(
        `governance: approver '${approver}' not authorized for gate '${request.gate}'`,
      )
    }
    return this.decide(request, {
      status: "approved",
      approver,
      reason,
    })
  }

  deny(requestId: string, approver: string, reason?: string): ApprovalDecision {
    const request = this.must(requestId)
    const gate = this.gates.get(request.gate)
    if (!gate) throw new GateNotRegisteredError(request.gate)
    if (!gate.requiredApprovers.includes(approver)) {
      throw new Error(
        `governance: approver '${approver}' not authorized for gate '${request.gate}'`,
      )
    }
    return this.decide(request, {
      status: "denied",
      approver,
      reason,
    })
  }

  override(
    requestId: string,
    actor: string,
    rationale: string,
    acknowledgedRisk = true,
  ): OverrideRecord {
    this.must(requestId)
    if (!rationale || rationale.trim().length === 0) {
      throw new Error("governance: override rationale required")
    }
    const record: OverrideRecord = {
      requestId,
      actor,
      rationale,
      acknowledgedRisk,
      at: Date.now(),
    }
    this.overrides.push(record)
    this.decide(this.requests.get(requestId)!, {
      status: "overridden",
      approver: actor,
      reason: rationale,
    })
    this.events.emit("approval_overridden", { override: record })
    this.onAudit?.({ kind: "override", data: record })
    return record
  }

  decision(requestId: string): ApprovalDecision | undefined {
    return this.decisions.get(requestId)
  }

  listOverrides(): OverrideRecord[] {
    return [...this.overrides]
  }

  private must(requestId: string): GovernanceApprovalRequest {
    const r = this.requests.get(requestId)
    if (!r) throw new ApprovalRequestNotFoundError(requestId)
    return r
  }

  private decide(
    request: GovernanceApprovalRequest,
    partial: { status: ApprovalDecision["status"]; approver: string; reason?: string },
  ): ApprovalDecision {
    const decision: ApprovalDecision = {
      requestId: request.id,
      status: partial.status,
      approver: partial.approver,
      reason: partial.reason,
      decidedAt: Date.now(),
    }
    this.decisions.set(request.id, decision)
    this.events.emit("approval_decided", { decision })
    this.onAudit?.({ kind: "decision", data: decision })
    return decision
  }
}
