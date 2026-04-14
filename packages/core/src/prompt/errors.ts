export type PromptErrorCode = "BASE" | "TEMPLATE_NOT_FOUND" | "MISSING_VAR" | "RENDER"

export class PromptError extends Error {
  readonly code: PromptErrorCode
  constructor(message: string, code: PromptErrorCode = "BASE") {
    super(message)
    this.name = "PromptError"
    this.code = code
  }
}

export class TemplateNotFoundError extends PromptError {
  readonly templateId: string
  readonly version?: string
  constructor(templateId: string, version?: string) {
    super(
      `prompt: template ${templateId}${version ? `@${version}` : ""} not registered`,
      "TEMPLATE_NOT_FOUND",
    )
    this.name = "TemplateNotFoundError"
    this.templateId = templateId
    this.version = version
  }
}

export class MissingVariableError extends PromptError {
  readonly variable: string
  constructor(variable: string) {
    super(`prompt: missing required variable '${variable}'`, "MISSING_VAR")
    this.name = "MissingVariableError"
    this.variable = variable
  }
}

export class RenderError extends PromptError {
  override readonly cause: unknown
  constructor(message: string, cause?: unknown) {
    super(`prompt: render error: ${message}`, "RENDER")
    this.name = "RenderError"
    this.cause = cause
  }
}
