import { describe, expect, test } from "bun:test"
import { encodeLspMessage, LspMessageStream } from "../../src/lsp/framing.ts"

describe("LSP framing", () => {
  test("encode includes Content-Length header + CRLF separator", () => {
    const out = encodeLspMessage({ jsonrpc: "2.0", id: 1, method: "ping" })
    const text = new TextDecoder().decode(out)
    expect(text.startsWith("Content-Length: ")).toBe(true)
    expect(text).toContain("\r\n\r\n")
    expect(text.endsWith('"ping"}')).toBe(true)
  })

  test("Content-Length matches byte length of body", () => {
    const out = encodeLspMessage({ jsonrpc: "2.0", method: "x", params: { a: "ñ" } })
    const text = new TextDecoder().decode(out)
    const m = text.match(/Content-Length: (\d+)\r\n/)
    expect(m).not.toBeNull()
    const declared = Number(m![1])
    const body = text.split("\r\n\r\n")[1]!
    const actual = new TextEncoder().encode(body).byteLength
    expect(declared).toBe(actual)
  })

  test("LspMessageStream parses a single complete message", () => {
    const stream = new LspMessageStream()
    const out: unknown[] = []
    stream.onMessage((m) => out.push(m))
    stream.feed(encodeLspMessage({ jsonrpc: "2.0", id: 1, result: { ok: true } }))
    expect(out).toEqual([{ jsonrpc: "2.0", id: 1, result: { ok: true } }])
  })

  test("parses multiple messages in one chunk", () => {
    const stream = new LspMessageStream()
    const out: unknown[] = []
    stream.onMessage((m) => out.push(m))
    const a = encodeLspMessage({ jsonrpc: "2.0", id: 1, method: "a" })
    const b = encodeLspMessage({ jsonrpc: "2.0", id: 2, method: "b" })
    const merged = new Uint8Array(a.length + b.length)
    merged.set(a, 0)
    merged.set(b, a.length)
    stream.feed(merged)
    expect(out).toHaveLength(2)
  })

  test("handles message split across two feeds", () => {
    const stream = new LspMessageStream()
    const out: unknown[] = []
    stream.onMessage((m) => out.push(m))
    const buf = encodeLspMessage({ jsonrpc: "2.0", id: 9, method: "split" })
    stream.feed(buf.slice(0, 10))
    expect(out).toHaveLength(0)
    stream.feed(buf.slice(10))
    expect(out).toHaveLength(1)
  })

  test("ignores extra headers other than Content-Length", () => {
    const stream = new LspMessageStream()
    const out: unknown[] = []
    stream.onMessage((m) => out.push(m))
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: 7 })
    const bytes = new TextEncoder().encode(body)
    const header = `Content-Length: ${bytes.byteLength}\r\nContent-Type: application/vscode-jsonrpc; charset=utf-8\r\n\r\n`
    const merged = new Uint8Array(header.length + bytes.length)
    merged.set(new TextEncoder().encode(header), 0)
    merged.set(bytes, header.length)
    stream.feed(merged)
    expect(out[0]).toEqual({ jsonrpc: "2.0", id: 1, result: 7 })
  })
})
