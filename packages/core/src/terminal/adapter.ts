import { spawn as spawnPty } from "node-pty"

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

function requireCommand(opts: PtySpawnOptions): { file: string; args: string[] } {
  const [file, ...args] = opts.command
  if (!file) throw new Error("pty spawn requires a command")
  const resolved = file.includes("/") ? file : (Bun.which(file) ?? file)
  return { file: resolved, args }
}

function cleanEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    out[key] = value
  }
  return out
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

  spawn(opts: PtySpawnOptions): PtyProcess {
    const { file, args } = requireCommand(opts)
    const pty = spawnPty(file, args, {
      cwd: opts.cwd,
      env: cleanEnv({
        ...process.env,
        ...(opts.env ?? {}),
      }),
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
      name: process.env.TERM ?? "xterm-256color",
    })
    const outputHandlers: ((c: PtyOutputChunk) => void)[] = []
    const exitHandlers: ((e: PtyExit) => void)[] = []

    pty.onData((data) => {
      for (const handler of outputHandlers) handler({ data, stream: "stdout" })
    })
    pty.onExit(({ exitCode }) => {
      for (const handler of exitHandlers) handler({ exitCode })
    })

    return {
      onOutput: (cb) => outputHandlers.push(cb),
      onExit: (cb) => exitHandlers.push(cb),
      write: (data) => {
        pty.write(data)
      },
      closeStdin: () => {
        if (process.platform === "win32") {
          pty.kill()
          return
        }
        pty.write("\u0004")
      },
      resize: (cols, rows) => {
        pty.resize(cols, rows)
      },
      kill: (signal = "SIGTERM") => pty.kill(signal),
    }
  }
}
