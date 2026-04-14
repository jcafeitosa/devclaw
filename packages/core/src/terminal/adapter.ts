export interface PtySpawnOptions {
  command: string[]
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export interface PtyOutputChunk {
  data: string
  stream: "stdout" | "stderr"
}

export interface PtyExit {
  exitCode: number
}

export interface PtyProcess {
  onOutput(cb: (chunk: PtyOutputChunk) => void): void
  onExit(cb: (exit: PtyExit) => void): void
  write(data: string): void | Promise<void>
  closeStdin?(): void | Promise<void>
  resize(cols: number, rows: number): void
  kill(signal?: NodeJS.Signals): void
}

export interface PtyAdapter {
  readonly kind: string
  spawn(opts: PtySpawnOptions): PtyProcess
}

export class NotImplementedPtyError extends Error {
  constructor(adapter: string) {
    super(`${adapter} is not implemented (add node-pty binding to enable real PTY)`)
    this.name = "NotImplementedPtyError"
  }
}

export class BunPtyAdapter implements PtyAdapter {
  readonly kind = "bun"

  spawn(opts: PtySpawnOptions): PtyProcess {
    const env = {
      ...process.env,
      ...(opts.env ?? {}),
      COLUMNS: String(opts.cols ?? 80),
      LINES: String(opts.rows ?? 24),
    }
    const proc = Bun.spawn(opts.command, {
      cwd: opts.cwd,
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    const outputHandlers: ((c: PtyOutputChunk) => void)[] = []
    const exitHandlers: ((e: PtyExit) => void)[] = []
    const pipe = async (
      stream: ReadableStream<Uint8Array> | null,
      which: "stdout" | "stderr",
    ): Promise<void> => {
      if (!stream) return
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        const data = decoder.decode(value, { stream: true })
        if (data) for (const h of outputHandlers) h({ data, stream: which })
      }
    }
    void pipe(proc.stdout as ReadableStream<Uint8Array> | null, "stdout")
    void pipe(proc.stderr as ReadableStream<Uint8Array> | null, "stderr")
    void proc.exited.then((exitCode) => {
      for (const h of exitHandlers) h({ exitCode })
    })
    return {
      onOutput: (cb) => outputHandlers.push(cb),
      onExit: (cb) => exitHandlers.push(cb),
      write: (data) => {
        const sink = proc.stdin as { write?: (d: string) => void } | undefined
        sink?.write?.(data)
      },
      closeStdin: async () => {
        const sink = proc.stdin as unknown as { end?: () => Promise<void> | void } | undefined
        await sink?.end?.()
      },
      resize: () => {
        // Bun has no PTY — COLUMNS/LINES set at spawn; runtime resize is a noop
      },
      kill: (signal = "SIGTERM") => proc.kill(signal),
    }
  }
}

export class NodePtyAdapter implements PtyAdapter {
  readonly kind = "node-pty"

  spawn(_opts: PtySpawnOptions): PtyProcess {
    throw new NotImplementedPtyError("NodePtyAdapter")
  }
}
