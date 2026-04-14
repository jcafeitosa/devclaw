import { describe, expect, test } from "bun:test"
import {
  errorResponse,
  isNotification,
  isRequest,
  isResponse,
  JsonRpcError,
  JsonRpcErrorCodes,
  makeNotification,
  makeRequest,
  parseMessage,
  successResponse,
} from "../../src/protocol/jsonrpc.ts"

describe("JSON-RPC primitives", () => {
  test("isRequest accepts well-formed request", () => {
    expect(isRequest({ jsonrpc: "2.0", id: 1, method: "x" })).toBe(true)
    expect(isRequest({ jsonrpc: "2.0", id: "s", method: "x" })).toBe(true)
  })

  test("isRequest rejects missing id", () => {
    expect(isRequest({ jsonrpc: "2.0", method: "x" })).toBe(false)
  })

  test("isNotification accepts missing id", () => {
    expect(isNotification({ jsonrpc: "2.0", method: "x" })).toBe(true)
  })

  test("isResponse with result", () => {
    expect(isResponse({ jsonrpc: "2.0", id: 1, result: {} })).toBe(true)
  })

  test("isResponse with error", () => {
    expect(isResponse({ jsonrpc: "2.0", id: 1, error: { code: -1, message: "x" } })).toBe(true)
  })

  test("parseMessage throws ParseError on bad JSON", () => {
    try {
      parseMessage("{bad")
      throw new Error("should have thrown")
    } catch (err) {
      expect(err).toBeInstanceOf(JsonRpcError)
      expect((err as JsonRpcError).code).toBe(JsonRpcErrorCodes.ParseError)
    }
  })

  test("parseMessage throws InvalidRequest when shape invalid", () => {
    try {
      parseMessage(JSON.stringify({ jsonrpc: "1.0", method: "x" }))
      throw new Error("should have thrown")
    } catch (err) {
      expect((err as JsonRpcError).code).toBe(JsonRpcErrorCodes.InvalidRequest)
    }
  })

  test("makeRequest + successResponse + errorResponse envelope", () => {
    const req = makeRequest(1, "foo", { a: 1 })
    expect(req.jsonrpc).toBe("2.0")
    expect(req.id).toBe(1)
    const ok = successResponse(1, { b: 2 })
    expect(ok.result).toEqual({ b: 2 })
    const err = errorResponse(1, JsonRpcError.methodNotFound("bar"))
    expect(err.error.code).toBe(JsonRpcErrorCodes.MethodNotFound)
  })

  test("makeNotification has no id", () => {
    const n = makeNotification("evt", { x: 1 })
    expect((n as { id?: unknown }).id).toBeUndefined()
  })
})
