import { describe, expect, test } from "bun:test"
import { LSPClient } from "../../src/lsp/client.ts"
import { encodeLspMessage } from "../../src/lsp/framing.ts"

function makeTransport() {
  const sent: Uint8Array[] = []
  let onData: ((bytes: Uint8Array) => void) | undefined
  return {
    sent,
    write(bytes: Uint8Array) {
      sent.push(bytes)
    },
    onData(cb: (bytes: Uint8Array) => void) {
      onData = cb
    },
    deliver(bytes: Uint8Array) {
      onData?.(bytes)
    },
    sentText() {
      return sent.map((b) => new TextDecoder().decode(b)).join("")
    },
    lastBody(): unknown {
      const text = sent.map((b) => new TextDecoder().decode(b)).join("")
      const parts = text.split("\r\n\r\n")
      const body = parts[parts.length - 1]
      return JSON.parse(body!)
    },
  }
}

describe("LSPClient", () => {
  test("initialize sends request and resolves on response", async () => {
    const t = makeTransport()
    const client = new LSPClient({ transport: t })
    const pending = client.initialize({
      processId: 1,
      capabilities: {},
      rootUri: "file:///x",
    })
    const sent = t.lastBody() as { id: number; method: string }
    expect(sent.method).toBe("initialize")
    t.deliver(
      encodeLspMessage({
        jsonrpc: "2.0",
        id: sent.id,
        result: { capabilities: { textDocumentSync: 1 } },
      }),
    )
    const result = (await pending) as { capabilities: { textDocumentSync: number } }
    expect(result.capabilities.textDocumentSync).toBe(1)
  })

  test("notify sends notification (no id)", () => {
    const t = makeTransport()
    const client = new LSPClient({ transport: t })
    client.notify("initialized", {})
    const body = t.lastBody() as { method: string; id?: number }
    expect(body.method).toBe("initialized")
    expect(body.id).toBeUndefined()
  })

  test("didOpen sends textDocument/didOpen notification", () => {
    const t = makeTransport()
    const client = new LSPClient({ transport: t })
    client.didOpen({ uri: "file:///a.ts", languageId: "typescript", version: 1, text: "x" })
    const body = t.lastBody() as { method: string; params: { textDocument: { uri: string } } }
    expect(body.method).toBe("textDocument/didOpen")
    expect(body.params.textDocument.uri).toBe("file:///a.ts")
  })

  test("server-pushed publishDiagnostics fires onDiagnostics", () => {
    const t = makeTransport()
    const client = new LSPClient({ transport: t })
    let received: { uri: string; count: number } | null = null as {
      uri: string
      count: number
    } | null
    client.onDiagnostics((p) => {
      received = { uri: p.uri, count: p.diagnostics.length }
    })
    t.deliver(
      encodeLspMessage({
        jsonrpc: "2.0",
        method: "textDocument/publishDiagnostics",
        params: {
          uri: "file:///a.ts",
          diagnostics: [{ message: "oops", severity: 1, range: {} }],
        },
      }),
    )
    expect(received).toEqual({ uri: "file:///a.ts", count: 1 })
  })

  test("shutdown then exit closes lifecycle", async () => {
    const t = makeTransport()
    const client = new LSPClient({ transport: t })
    const pending = client.shutdown()
    const sent = t.lastBody() as { id: number }
    t.deliver(encodeLspMessage({ jsonrpc: "2.0", id: sent.id, result: null }))
    await pending
    client.exit()
    const last = t.lastBody() as { method: string }
    expect(last.method).toBe("exit")
  })
})
