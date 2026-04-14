export class TerminalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TerminalError"
  }
}

export class TerminalNotFoundError extends TerminalError {
  constructor(id: string) {
    super(`terminal not found: ${id}`)
    this.name = "TerminalNotFoundError"
  }
}

export class TerminalAlreadyStartedError extends TerminalError {
  constructor() {
    super("terminal session already started")
    this.name = "TerminalAlreadyStartedError"
  }
}
