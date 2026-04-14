export type OAuthErrorCode =
  | "BASE"
  | "PORT_EXHAUSTED"
  | "STATE_MISMATCH"
  | "TIMEOUT"
  | "USER_DENIED"
  | "TOKEN_ENDPOINT"
  | "BROWSER_UNAVAILABLE"

export class OAuthError extends Error {
  readonly code: OAuthErrorCode
  constructor(message: string, code: OAuthErrorCode = "BASE") {
    super(message)
    this.name = "OAuthError"
    this.code = code
  }
}

export class OAuthPortExhaustedError extends OAuthError {
  readonly ports: number[]
  constructor(ports: number[]) {
    super(`OAuth: all ports busy: ${ports.join(", ")}`, "PORT_EXHAUSTED")
    this.name = "OAuthPortExhaustedError"
    this.ports = ports
  }
}

export class OAuthStateMismatchError extends OAuthError {
  constructor() {
    super("OAuth: state parameter mismatch (CSRF)", "STATE_MISMATCH")
    this.name = "OAuthStateMismatchError"
  }
}

export class OAuthTimeoutError extends OAuthError {
  readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(`OAuth: no callback within ${timeoutMs}ms`, "TIMEOUT")
    this.name = "OAuthTimeoutError"
    this.timeoutMs = timeoutMs
  }
}

export class OAuthUserDeniedError extends OAuthError {
  readonly reason: string
  constructor(reason: string) {
    super(`OAuth: user denied (${reason})`, "USER_DENIED")
    this.name = "OAuthUserDeniedError"
    this.reason = reason
  }
}

export class OAuthTokenError extends OAuthError {
  readonly status: number
  readonly body: string
  constructor(status: number, body: string) {
    super(`OAuth: token endpoint ${status}: ${body}`, "TOKEN_ENDPOINT")
    this.name = "OAuthTokenError"
    this.status = status
    this.body = body
  }
}

export class OAuthBrowserUnavailableError extends OAuthError {
  constructor() {
    super("OAuth: unable to open browser; use manual URL", "BROWSER_UNAVAILABLE")
    this.name = "OAuthBrowserUnavailableError"
  }
}
