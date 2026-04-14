export type SlashErrorCode = "BASE" | "NOT_FOUND" | "VALIDATION" | "PARSE"

export class SlashError extends Error {
  readonly code: SlashErrorCode
  constructor(message: string, code: SlashErrorCode = "BASE") {
    super(message)
    this.name = "SlashError"
    this.code = code
  }
}

export class CommandNotFoundError extends SlashError {
  readonly command: string
  constructor(command: string) {
    super(`slash: command '/${command}' not registered`, "NOT_FOUND")
    this.name = "CommandNotFoundError"
    this.command = command
  }
}

export class CommandValidationError extends SlashError {
  readonly issues: string[]
  constructor(command: string, issues: string[]) {
    super(`slash: /${command} invalid args — ${issues.join("; ")}`, "VALIDATION")
    this.name = "CommandValidationError"
    this.issues = [...issues]
  }
}

export class CommandParseError extends SlashError {
  readonly raw: string
  constructor(raw: string, detail: string) {
    super(`slash: parse failed on '${raw}': ${detail}`, "PARSE")
    this.name = "CommandParseError"
    this.raw = raw
  }
}
