export class CapabilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CapabilityError"
  }
}

export class CapabilityNotFoundError extends CapabilityError {
  constructor(id: string) {
    super(`capability not found: ${id}`)
    this.name = "CapabilityNotFoundError"
  }
}

export class CapabilityUnavailableError extends CapabilityError {
  readonly capabilityId: string
  readonly reason: string
  constructor(capabilityId: string, reason: string) {
    super(`capability '${capabilityId}' unavailable: ${reason}`)
    this.name = "CapabilityUnavailableError"
    this.capabilityId = capabilityId
    this.reason = reason
  }
}
