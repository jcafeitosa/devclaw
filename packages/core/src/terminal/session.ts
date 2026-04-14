import { EventEmitter } from "../util/event_emitter.ts"
import { BunPtyAdapter, type PtyAdapter, type PtyProcess } from "./adapter.ts"
import type { TerminalAuditSink } from "./audit.ts"
import { TerminalAlreadyStartedError } from "./errors.ts"
import { DEFAULT_REDACTION_PATTERNS, type RedactionPattern, redactOutput } from "./redaction.ts"
import type { TerminalEvents, TerminalSize, TerminalStartOptions } from "./types.ts"

export class TerminalPermissionDeniedError extends Error {
  constructor(reason?: string) {
    super(`terminal start denied${reason ? `: ${reason}` : ""}`)
    this.name = "TerminalPermissionDeniedError"
  }
}

export interface TerminalStartWithReason extends TerminalStartOptions {
  reason?: string
}

export interface TerminalApprovalRequest {
  command: string[]
  cwd?: string
  reason?: string
}

export interface TerminalApprovalDecision {
  allow: boolean
  reason?: string
}

export type TerminalApprover = (
  req: TerminalApprovalRequest,
) => Promise<TerminalApprovalDecision> | TerminalApprovalDecision

export interface TerminalSessionConfig {
  adapter?: PtyAdapter
  requireApproval?: boolean
  approver?: TerminalApprover
  audit?: TerminalAuditSink
  redact?: boolean
  redactionPatterns?: readonly RedactionPattern[]
}

export class TerminalSession {
  readonly events = new EventEmitter<TerminalEvents>()
  private proc: PtyProcess | undefined
  private dims: TerminalSize = { cols: 80, rows: 24 }
  private started = false
  private readonly cfg: TerminalSessionConfig
  private readonly adapter: PtyAdapter
  private readonly patterns: readonly RedactionPattern[]
  private startedAt = 0

  constructor(cfg: TerminalSessionConfig = {}) {
    this.cfg = cfg
    this.adapter = cfg.adapter ?? new BunPtyAdapter()
    this.patterns = cfg.redactionPatterns ?? DEFAULT_REDACTION_PATTERNS
  }

  async start(opts: TerminalStartWithReason): Promise<void> {
    if (this.started) throw new TerminalAlreadyStartedError()
    if (this.cfg.requireApproval) {
      const decision = this.cfg.approver
        ? await this.cfg.approver({ command: opts.command, cwd: opts.cwd, reason: opts.reason })
        : { allow: false, reason: "no approver configured" }
      if (!decision.allow) {
        this.cfg.audit?.({
          kind: "denied",
          at: Date.now(),
          command: opts.command,
          reason: decision.reason,
        })
        throw new TerminalPermissionDeniedError(decision.reason)
      }
    }
    this.started = true
    this.startedAt = performance.now()
    if (opts.cols !== undefined) this.dims.cols = opts.cols
    if (opts.rows !== undefined) this.dims.rows = opts.rows
    this.proc = this.adapter.spawn({
      command: opts.command,
      cwd: opts.cwd,
      env: opts.env,
      cols: this.dims.cols,
      rows: this.dims.rows,
    })
    this.cfg.audit?.({
      kind: "start",
      at: Date.now(),
      command: opts.command,
      cwd: opts.cwd,
      reason: opts.reason,
    })
    this.proc.onOutput(({ data, stream }) => {
      const out = this.cfg.redact ? redactOutput(data, this.patterns) : data
      this.events.emit("output", { data: out, stream })
    })
    this.proc.onExit(({ exitCode }) => {
      const durationMs = performance.now() - this.startedAt
      this.cfg.audit?.({ kind: "exit", at: Date.now(), exitCode, durationMs })
      this.events.emit("exit", { exitCode })
    })
  }

  async write(data: string): Promise<void> {
    await this.proc?.write(data)
    this.cfg.audit?.({ kind: "write", at: Date.now(), bytes: data.length })
  }

  async closeStdin(): Promise<void> {
    await this.proc?.closeStdin?.()
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    this.proc?.kill(signal)
    this.cfg.audit?.({ kind: "kill", at: Date.now(), signal })
  }

  resize(cols: number, rows: number): void {
    this.dims = { cols, rows }
    this.proc?.resize(cols, rows)
  }

  size(): TerminalSize {
    return { ...this.dims }
  }
}
