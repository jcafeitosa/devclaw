export const JSONRPC_VERSION = "2.0"

export type JsonRpcId = string | number | null

export interface JsonRpcRequest<P = unknown> {
  jsonrpc: "2.0"
  id: JsonRpcId
  method: string
  params?: P
}

export interface JsonRpcNotification<P = unknown> {
  jsonrpc: "2.0"
  method: string
  params?: P
}

export interface JsonRpcSuccessResponse<R = unknown> {
  jsonrpc: "2.0"
  id: JsonRpcId
  result: R
}

export interface JsonRpcErrorObject {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0"
  id: JsonRpcId
  error: JsonRpcErrorObject
}

export type JsonRpcResponse<R = unknown> = JsonRpcSuccessResponse<R> | JsonRpcErrorResponse
export type JsonRpcMessage<P = unknown, R = unknown> =
  | JsonRpcRequest<P>
  | JsonRpcNotification<P>
  | JsonRpcResponse<R>

export const JsonRpcErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  ServerError: -32000,
} as const

export class JsonRpcError extends Error {
  readonly code: number
  readonly data?: unknown
  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = "JsonRpcError"
    this.code = code
    this.data = data
  }

  toObject(): JsonRpcErrorObject {
    return { code: this.code, message: this.message, data: this.data }
  }

  static parseError(data?: unknown): JsonRpcError {
    return new JsonRpcError(JsonRpcErrorCodes.ParseError, "Parse error", data)
  }
  static invalidRequest(data?: unknown): JsonRpcError {
    return new JsonRpcError(JsonRpcErrorCodes.InvalidRequest, "Invalid Request", data)
  }
  static methodNotFound(method: string): JsonRpcError {
    return new JsonRpcError(JsonRpcErrorCodes.MethodNotFound, `Method not found: ${method}`)
  }
  static invalidParams(message: string, data?: unknown): JsonRpcError {
    return new JsonRpcError(JsonRpcErrorCodes.InvalidParams, message, data)
  }
  static internal(message: string, data?: unknown): JsonRpcError {
    return new JsonRpcError(JsonRpcErrorCodes.InternalError, message, data)
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

export function isRequest(msg: unknown): msg is JsonRpcRequest {
  if (!isRecord(msg)) return false
  return (
    msg.jsonrpc === JSONRPC_VERSION &&
    typeof msg.method === "string" &&
    (typeof msg.id === "string" || typeof msg.id === "number" || msg.id === null) &&
    msg.id !== undefined
  )
}

export function isNotification(msg: unknown): msg is JsonRpcNotification {
  if (!isRecord(msg)) return false
  return msg.jsonrpc === JSONRPC_VERSION && typeof msg.method === "string" && msg.id === undefined
}

export function isResponse(msg: unknown): msg is JsonRpcResponse {
  if (!isRecord(msg)) return false
  if (msg.jsonrpc !== JSONRPC_VERSION) return false
  if (msg.id === undefined) return false
  return "result" in msg || "error" in msg
}

export function parseMessage(raw: string): JsonRpcMessage {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw JsonRpcError.parseError(err instanceof Error ? err.message : String(err))
  }
  if (isRequest(parsed) || isNotification(parsed) || isResponse(parsed)) return parsed
  throw JsonRpcError.invalidRequest({ raw })
}

export function successResponse<R>(id: JsonRpcId, result: R): JsonRpcSuccessResponse<R> {
  return { jsonrpc: JSONRPC_VERSION, id, result }
}

export function errorResponse(id: JsonRpcId, error: JsonRpcError): JsonRpcErrorResponse {
  return { jsonrpc: JSONRPC_VERSION, id, error: error.toObject() }
}

export function makeRequest<P>(id: JsonRpcId, method: string, params?: P): JsonRpcRequest<P> {
  return { jsonrpc: JSONRPC_VERSION, id, method, params }
}

export function makeNotification<P>(method: string, params?: P): JsonRpcNotification<P> {
  return { jsonrpc: JSONRPC_VERSION, method, params }
}
