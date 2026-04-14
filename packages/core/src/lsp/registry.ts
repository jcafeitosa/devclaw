export class LSPServerNotFoundError extends Error {
  constructor(language: string) {
    super(`no LSP server registered for language: ${language}`)
    this.name = "LSPServerNotFoundError"
  }
}

export interface LSPServerConfig {
  command: string[]
  env?: Record<string, string>
  cwd?: string
  initializationOptions?: unknown
}

export class LSPRegistry {
  private readonly servers = new Map<string, LSPServerConfig>()

  register(language: string, config: LSPServerConfig): void {
    this.servers.set(language, config)
  }

  get(language: string): LSPServerConfig {
    const s = this.servers.get(language)
    if (!s) throw new LSPServerNotFoundError(language)
    return s
  }

  languages(): string[] {
    return [...this.servers.keys()]
  }
}
