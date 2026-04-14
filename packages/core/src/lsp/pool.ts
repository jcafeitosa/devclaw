import { LSPClient, type LSPTransport } from "./client.ts"
import type { LSPRegistry } from "./registry.ts"

export interface LSPSpawnOptions {
  command: string[]
  cwd?: string
  env?: Record<string, string>
}

export interface LSPSpawnedProcess {
  write(bytes: Uint8Array): void
  onData(cb: (bytes: Uint8Array) => void): void
  onExit(cb: (exitCode: number) => void): void
  kill(signal?: string): void
}

export type LSPSpawner = (opts: LSPSpawnOptions) => LSPSpawnedProcess

function defaultSpawner(opts: LSPSpawnOptions): LSPSpawnedProcess {
  const env = opts.env ? { ...process.env, ...opts.env } : { ...process.env }
  const proc = Bun.spawn(opts.command, {
    cwd: opts.cwd,
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  let dataCb: ((bytes: Uint8Array) => void) | undefined
  void (async () => {
    const stream = proc.stdout as ReadableStream<Uint8Array> | null
    if (!stream) return
    const reader = stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      if (value && dataCb) dataCb(value)
    }
  })()
  let exitCb: ((exitCode: number) => void) | undefined
  void proc.exited.then((code) => exitCb?.(code))
  return {
    write: (bytes) => {
      const sink = proc.stdin as unknown as { write?: (b: Uint8Array) => void }
      sink.write?.(bytes)
    },
    onData: (cb) => {
      dataCb = cb
    },
    onExit: (cb) => {
      exitCb = cb
    },
    kill: (signal) => proc.kill((signal ?? "SIGTERM") as NodeJS.Signals),
  }
}

export interface LSPPoolConfig {
  registry: LSPRegistry
  spawner?: LSPSpawner
  idleTimeoutMs?: number
  maxRestarts?: number
  restartBackoffMs?: number
}

interface PooledServer {
  language: string
  workspace: string
  proc: LSPSpawnedProcess
  client: LSPClient
  refCount: number
  lastActivityAt: number
  idleTimer?: ReturnType<typeof setTimeout>
  crashCount: number
  stopped: boolean
}

export interface LSPPoolStat {
  language: string
  workspace: string
  refCount: number
  lastActivityAt: number
  crashCount: number
}

function key(language: string, workspace: string): string {
  return `${language}::${workspace}`
}

export class LSPPool {
  private readonly registry: LSPRegistry
  private readonly spawner: LSPSpawner
  private readonly idleTimeoutMs: number
  private readonly maxRestarts: number
  private readonly restartBackoffMs: number
  private readonly servers = new Map<string, PooledServer>()

  constructor(cfg: LSPPoolConfig) {
    this.registry = cfg.registry
    this.spawner = cfg.spawner ?? defaultSpawner
    this.idleTimeoutMs = cfg.idleTimeoutMs ?? 5 * 60_000
    this.maxRestarts = cfg.maxRestarts ?? 3
    this.restartBackoffMs = cfg.restartBackoffMs ?? 1000
  }

  async acquire(language: string, workspace: string): Promise<LSPClient> {
    const k = key(language, workspace)
    let srv = this.servers.get(k)
    if (!srv) {
      srv = this.spawnOne(language, workspace)
      this.servers.set(k, srv)
    }
    srv.refCount++
    srv.lastActivityAt = Date.now()
    this.clearIdle(srv)
    return srv.client
  }

  release(language: string, workspace: string): void {
    const srv = this.servers.get(key(language, workspace))
    if (!srv) return
    srv.refCount = Math.max(0, srv.refCount - 1)
    if (srv.refCount === 0) this.scheduleIdle(srv)
  }

  stats(): LSPPoolStat[] {
    return [...this.servers.values()].map((s) => ({
      language: s.language,
      workspace: s.workspace,
      refCount: s.refCount,
      lastActivityAt: s.lastActivityAt,
      crashCount: s.crashCount,
    }))
  }

  async shutdownAll(): Promise<void> {
    for (const srv of this.servers.values()) {
      srv.stopped = true
      this.clearIdle(srv)
      srv.proc.kill("SIGTERM")
    }
    this.servers.clear()
  }

  private spawnOne(language: string, workspace: string): PooledServer {
    const cfg = this.registry.get(language)
    const proc = this.spawner({ command: cfg.command, cwd: workspace, env: cfg.env })
    const transport: LSPTransport = {
      write: (bytes) => proc.write(bytes),
      onData: (cb) => proc.onData(cb),
    }
    const client = new LSPClient({ transport })
    const srv: PooledServer = {
      language,
      workspace,
      proc,
      client,
      refCount: 0,
      lastActivityAt: Date.now(),
      crashCount: 0,
      stopped: false,
    }
    proc.onExit((code) => this.handleExit(srv, code))
    return srv
  }

  private handleExit(srv: PooledServer, code: number): void {
    if (srv.stopped) return
    if (code === 0) {
      this.servers.delete(key(srv.language, srv.workspace))
      return
    }
    srv.crashCount++
    if (srv.crashCount > this.maxRestarts) {
      srv.stopped = true
      this.servers.delete(key(srv.language, srv.workspace))
      return
    }
    const backoff = this.restartBackoffMs * 2 ** (srv.crashCount - 1)
    setTimeout(() => this.restart(srv), backoff)
  }

  private restart(srv: PooledServer): void {
    if (srv.stopped) return
    const cfg = this.registry.get(srv.language)
    const proc = this.spawner({ command: cfg.command, cwd: srv.workspace, env: cfg.env })
    srv.proc = proc
    const transport: LSPTransport = {
      write: (bytes) => proc.write(bytes),
      onData: (cb) => proc.onData(cb),
    }
    srv.client = new LSPClient({ transport })
    proc.onExit((code) => this.handleExit(srv, code))
  }

  private scheduleIdle(srv: PooledServer): void {
    this.clearIdle(srv)
    srv.idleTimer = setTimeout(() => {
      if (srv.refCount === 0 && !srv.stopped) {
        srv.stopped = true
        srv.proc.kill("SIGTERM")
        this.servers.delete(key(srv.language, srv.workspace))
      }
    }, this.idleTimeoutMs)
  }

  private clearIdle(srv: PooledServer): void {
    if (srv.idleTimer) {
      clearTimeout(srv.idleTimer)
      srv.idleTimer = undefined
    }
  }
}
