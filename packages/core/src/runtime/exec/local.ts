import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { EphemeralRuntime } from "../ephemeral.ts"
import type { ManagedRuntime } from "../types.ts"
import type { CodeExecAdapter, CodeExecOptions, CodeExecResult } from "./types.ts"
import { UnsupportedLanguageError } from "./types.ts"

export type { CodeExecAdapter, CodeExecOptions, CodeExecResult } from "./types.ts"
export { UnsupportedLanguageError } from "./types.ts"

export interface LanguageSpec {
  filename: string
  command: (path: string, args: string[]) => string[]
}

export const DEFAULT_LANGUAGES: Record<string, LanguageSpec> = {
  shell: {
    filename: "main.sh",
    command: (path, args) => ["sh", path, ...args],
  },
  bash: {
    filename: "main.sh",
    command: (path, args) => ["bash", path, ...args],
  },
  python: {
    filename: "main.py",
    command: (path, args) => ["python3", path, ...args],
  },
  node: {
    filename: "main.js",
    command: (path, args) => ["node", path, ...args],
  },
  bun: {
    filename: "main.ts",
    command: (path, args) => ["bun", "run", path, ...args],
  },
}

export interface LocalEphemeralCodeExecAdapterConfig {
  runtime?: ManagedRuntime
  languages?: Record<string, LanguageSpec>
}

export class LocalEphemeralCodeExecAdapter implements CodeExecAdapter {
  readonly kind = "local-ephemeral"
  readonly runtime: ManagedRuntime
  private readonly languages: Record<string, LanguageSpec>

  constructor(cfg: LocalEphemeralCodeExecAdapterConfig = {}) {
    this.runtime = cfg.runtime ?? new EphemeralRuntime()
    this.languages = cfg.languages ?? DEFAULT_LANGUAGES
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
    const result = await this.runtime.run({
      command: lang.command(lang.filename, opts.args ?? []),
      stdin: opts.stdin,
      env: opts.env,
      timeoutMs: opts.timeoutMs,
      onCwd: async (cwd) => {
        await writeFile(join(cwd, lang.filename), code, "utf8")
      },
    })
    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
    }
  }
}
