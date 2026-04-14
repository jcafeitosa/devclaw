import { EventEmitter } from "../util/event_emitter.ts"
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
  requireApproval?: boolean
  approver?: TerminalApprover
  audit?: TerminalAuditSink
  redact?: boolean
  redactionPatterns?: readonly RedactionPattern[]
}

export class TerminalSession {
  readonly events = new EventEmitter<TerminalEvents>()
  private proc: ReturnType<typeof Bun.spawn> | undefined
  private dims: TerminalSize = { cols: 80, rows: 24 }
  private started = false
  private readonly cfg: TerminalSessionConfig
  private readonly patterns: readonly RedactionPattern[]
  private startedAt = 0

  constructor(cfg: TerminalSessionConfig = {}) {
    this.cfg = cfg
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
    const env = opts.env
      ? {
          ...process.env,
          ...opts.env,
          COLUMNS: String(this.dims.cols),
          LINES: String(this.dims.rows),
        }
      : { ...process.env, COLUMNS: String(this.dims.cols), LINES: String(this.dims.rows) }
    this.proc = Bun.spawn(opts.command, {
      cwd: opts.cwd,
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    this.cfg.audit?.({
      kind: "start",
      at: Date.now(),
      command: opts.command,
      cwd: opts.cwd,
      reason: opts.reason,
    })
    void this.pipe(this.proc.stdout as ReadableStream<Uint8Array> | null, "stdout")
    void this.pipe(this.proc.stderr as ReadableStream<Uint8Array> | null, "stderr")
    void this.proc.exited.then((exitCode) => {
      const durationMs = performance.now() - this.startedAt
      this.cfg.audit?.({ kind: "exit", at: Date.now(), exitCode, durationMs })
      this.events.emit("exit", { exitCode })
    })
  }

  async write(data: string): Promise<void> {
    const sink = this.proc?.stdin as { write?: (d: string) => void } | undefined
    sink?.write?.(data)
    this.cfg.audit?.({ kind: "write", at: Date.now(), bytes: data.length })
  }

  async closeStdin(): Promise<void> {
    const sink = this.proc?.stdin as { end?: () => Promise<void> | void } | undefined
    await sink?.end?.()
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    this.proc?.kill(signal)
    this.cfg.audit?.({ kind: "kill", at: Date.now(), signal })
  }

  resize(cols: number, rows: number): void {
    this.dims = { cols, rows }
  }

  size(): TerminalSize {
    return { ...this.dims }
  }

  private async pipe(
    stream: ReadableStream<Uint8Array> | null,
    which: "stdout" | "stderr",
  ): Promise<void> {
    if (!stream) return
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      const raw = decoder.decode(value, { stream: true })
      if (!raw) continue
      const data = this.cfg.redact ? redactOutput(raw, this.patterns) : raw
      this.events.emit("output", { data, stream: which })
    }
  }
}
