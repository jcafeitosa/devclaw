export class NodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NodeError"
  }
}

export class NodeNotFoundError extends NodeError {
  constructor(id: string) {
    super(`node not found: ${id}`)
    this.name = "NodeNotFoundError"
  }
}

export class DuplicateNodeError extends NodeError {
  constructor(id: string) {
    super(`node already registered: ${id}`)
    this.name = "DuplicateNodeError"
  }
}

export class DeviceNotFoundError extends NodeError {
  constructor(id: string) {
    super(`device not found: ${id}`)
    this.name = "DeviceNotFoundError"
  }
}
