export interface SpawnOptions {
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  stdin?: string
}

export interface ProcessHandle {
  readonly pid?: number
  stdout: AsyncIterable<string>
  stderr: AsyncIterable<string>
  readonly exited: Promise<number>
  readonly timedOut: boolean
  kill(): void
}

async function* linesFrom(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      while (true) {
        const index = buffer.indexOf("\n")
        if (index === -1) break
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        yield line
      }
    }
    if (buffer.length > 0) yield buffer
  } finally {
    reader.releaseLock()
  }
}

export class ProcessRunner {
  spawn(cmd: string[], opts: SpawnOptions = {}): ProcessHandle {
    const [bin, ...rest] = cmd
    if (!bin) throw new Error("ProcessRunner.spawn: empty command")
    const state = { timedOut: false }
    const proc = Bun.spawn([bin, ...rest], {
      cwd: opts.cwd,
      env: opts.env,
      stdin: opts.stdin !== undefined ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    if (opts.stdin !== undefined && proc.stdin) {
      proc.stdin.write(opts.stdin)
      proc.stdin.end()
    }
    const killTimer = opts.timeoutMs
      ? setTimeout(() => {
          state.timedOut = true
          proc.kill()
        }, opts.timeoutMs)
      : undefined

    const stdout = linesFrom(proc.stdout as unknown as ReadableStream<Uint8Array>)
    const stderr = linesFrom(proc.stderr as unknown as ReadableStream<Uint8Array>)
    const exited = proc.exited.finally(() => {
      if (killTimer) clearTimeout(killTimer)
    })

    return {
      pid: proc.pid,
      stdout,
      stderr,
      get timedOut() {
        return state.timedOut
      },
      exited,
      kill() {
        state.timedOut = false
        if (killTimer) clearTimeout(killTimer)
        proc.kill()
      },
    }
  }
}

export interface InjectableProcessRunner {
  spawn(cmd: string[], opts?: SpawnOptions): ProcessHandle
}
