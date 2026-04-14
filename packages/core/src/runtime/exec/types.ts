export interface CodeExecOptions {
  stdin?: string
  env?: Record<string, string>
  timeoutMs?: number
  args?: string[]
}

export interface CodeExecResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export interface CodeExecAdapter {
  readonly kind: string
  supports(language: string): boolean
  listLanguages(): string[]
  execute(language: string, code: string, opts?: CodeExecOptions): Promise<CodeExecResult>
}

export class UnsupportedLanguageError extends Error {
  readonly language: string
  constructor(language: string) {
    super(`unsupported language: ${language}`)
    this.name = "UnsupportedLanguageError"
    this.language = language
  }
}
