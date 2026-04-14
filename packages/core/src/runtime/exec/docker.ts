import type { CodeExecAdapter, CodeExecOptions, CodeExecResult } from "./types.ts"
import { UnsupportedLanguageError } from "./types.ts"

export interface DockerSpawnOptions {
  stdin?: string
  timeoutMs?: number
}

export type DockerSpawner = (
  command: string[],
  opts?: DockerSpawnOptions,
) => Promise<CodeExecResult>

const defaultSpawner: DockerSpawner = async (command, opts = {}) => {
  const proc = Bun.spawn(command, {
    stdin: opts.stdin !== undefined ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  if (opts.stdin !== undefined && proc.stdin) {
    const sink = proc.stdin as unknown as { write?: (d: string) => void; end?: () => Promise<void> }
    sink.write?.(opts.stdin)
    await sink.end?.()
  }
  const started = performance.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  if (opts.timeoutMs !== undefined) {
    timer = setTimeout(() => proc.kill("SIGKILL"), opts.timeoutMs)
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (timer) clearTimeout(timer)
  return { exitCode, stdout, stderr, durationMs: performance.now() - started }
}

export interface DockerLanguageSpec {
  image: string
  command: string[]
}

export const DEFAULT_DOCKER_LANGUAGES: Record<string, DockerLanguageSpec> = {
  python: { image: "python:3.12-alpine", command: ["python3", "-"] },
  node: { image: "node:22-alpine", command: ["node", "-"] },
  bash: { image: "alpine:3", command: ["sh", "-s"] },
  shell: { image: "alpine:3", command: ["sh", "-s"] },
}

export interface DockerSandboxCodeExecAdapterConfig {
  spawner?: DockerSpawner
  images?: Record<string, string>
  languages?: Record<string, DockerLanguageSpec>
  memoryLimit?: string
  cpuLimit?: string
  network?: boolean
  user?: string
  extraDockerFlags?: string[]
}

export class DockerSandboxCodeExecAdapter implements CodeExecAdapter {
  readonly kind = "docker-sandbox"
  private readonly spawner: DockerSpawner
  private readonly languages: Record<string, DockerLanguageSpec>
  private readonly memoryLimit?: string
  private readonly cpuLimit?: string
  private readonly network: boolean
  private readonly user?: string
  private readonly extraFlags: string[]

  constructor(cfg: DockerSandboxCodeExecAdapterConfig = {}) {
    this.spawner = cfg.spawner ?? defaultSpawner
    const base = cfg.languages ?? DEFAULT_DOCKER_LANGUAGES
    if (cfg.images) {
      const merged: Record<string, DockerLanguageSpec> = { ...base }
      for (const [lang, image] of Object.entries(cfg.images)) {
        const existing = base[lang]
        merged[lang] = existing ? { ...existing, image } : { image, command: ["sh", "-s"] }
      }
      this.languages = merged
    } else {
      this.languages = base
    }
    this.memoryLimit = cfg.memoryLimit
    this.cpuLimit = cfg.cpuLimit
    this.network = cfg.network ?? false
    this.user = cfg.user
    this.extraFlags = cfg.extraDockerFlags ?? []
  }

  supports(language: string): boolean {
    return Object.hasOwn(this.languages, language)
  }

  listLanguages(): string[] {
    return Object.keys(this.languages)
  }

  async execute(
    language: string,
    code: string,
    opts: CodeExecOptions = {},
  ): Promise<CodeExecResult> {
    const lang = this.languages[language]
    if (!lang) throw new UnsupportedLanguageError(language)
    const flags: string[] = ["run", "--rm", "-i"]
    if (!this.network) flags.push("--network=none")
    if (this.memoryLimit) flags.push("--memory", this.memoryLimit)
    if (this.cpuLimit) flags.push("--cpus", this.cpuLimit)
    if (this.user) flags.push("--user", this.user)
    for (const [k, v] of Object.entries(opts.env ?? {})) {
      flags.push("-e", `${k}=${v}`)
    }
    flags.push(...this.extraFlags)
    flags.push(lang.image)
    flags.push(...lang.command)
    flags.push(...(opts.args ?? []))
    return this.spawner(["docker", ...flags], {
      stdin: opts.stdin ?? code,
      timeoutMs: opts.timeoutMs,
    })
  }
}
