import { EventEmitter } from "../util/event_emitter.ts"
import { TerminalAlreadyStartedError } from "./errors.ts"
import type { TerminalEvents, TerminalSize, TerminalStartOptions } from "./types.ts"

export class TerminalSession {
  readonly events = new EventEmitter<TerminalEvents>()
  private proc: ReturnType<typeof Bun.spawn> | undefined
  private dims: TerminalSize = { cols: 80, rows: 24 }
  private started = false

  async start(opts: TerminalStartOptions): Promise<void> {
    if (this.started) throw new TerminalAlreadyStartedError()
    this.started = true
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
    void this.pipe(this.proc.stdout as ReadableStream<Uint8Array> | null, "stdout")
    void this.pipe(this.proc.stderr as ReadableStream<Uint8Array> | null, "stderr")
    void this.proc.exited.then((exitCode) => {
      this.events.emit("exit", { exitCode })
    })
  }

  async write(data: string): Promise<void> {
    const sink = this.proc?.stdin as { write?: (d: string) => void } | undefined
    sink?.write?.(data)
  }

  async closeStdin(): Promise<void> {
    const sink = this.proc?.stdin as { end?: () => Promise<void> | void } | undefined
    await sink?.end?.()
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    this.proc?.kill(signal)
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
      const data = decoder.decode(value, { stream: true })
      if (data) this.events.emit("output", { data, stream: which })
    }
  }
}
