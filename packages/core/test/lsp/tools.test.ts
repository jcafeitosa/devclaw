import { describe, expect, test } from "bun:test"
import { LSPClient } from "../../src/lsp/client.ts"
import { encodeLspMessage } from "../../src/lsp/framing.ts"
import { LSPAgentTools } from "../../src/lsp/tools.ts"

function setup() {
  const sent: Uint8Array[] = []
  let onData: ((bytes: Uint8Array) => void) | undefined
  const client = new LSPClient({
    transport: {
      write: (b) => {
        sent.push(b)
      },
      onData: (cb) => {
        onData = cb
      },
    },
  })
  const tools = new LSPAgentTools(client)
  return {
    tools,
    sent,
    deliver: (msg: unknown) => onData?.(encodeLspMessage(msg)),
    lastRequest(): { id: number; method: string; params: unknown } {
      const text = sent.map((b) => new TextDecoder().decode(b)).join("")
      const body = text.split("\r\n\r\n").pop()!
      return JSON.parse(body)
    },
  }
}

describe("LSPAgentTools — rename", () => {
  test("sends textDocument/rename and returns WorkspaceEdit", async () => {
    const { tools, deliver, lastRequest } = setup()
    const pending = tools.rename("file:///a.ts", { line: 1, character: 2 }, "newName")
    const req = lastRequest()
    expect(req.method).toBe("textDocument/rename")
    deliver({ jsonrpc: "2.0", id: req.id, result: { changes: { "file:///a.ts": [] } } })
    const result = (await pending) as { changes: Record<string, unknown[]> }
    expect(Object.keys(result.changes)).toContain("file:///a.ts")
  })
})

describe("LSPAgentTools — workspace/symbol", () => {
  test("sends workspace/symbol and returns list", async () => {
    const { tools, deliver, lastRequest } = setup()
    const pending = tools.workspaceSymbols("MyClass")
    const req = lastRequest()
    expect(req.method).toBe("workspace/symbol")
    expect(req.params).toEqual({ query: "MyClass" })
    deliver({ jsonrpc: "2.0", id: req.id, result: [{ name: "MyClass" }] })
    const symbols = (await pending) as { name: string }[]
    expect(symbols[0]!.name).toBe("MyClass")
  })

  test("limit is applied client-side", async () => {
    const { tools, deliver, lastRequest } = setup()
    const pending = tools.workspaceSymbols("Foo", 2)
    const req = lastRequest()
    deliver({
      jsonrpc: "2.0",
      id: req.id,
      result: [{ name: "A" }, { name: "B" }, { name: "C" }],
    })
    const symbols = (await pending) as { name: string }[]
    expect(symbols).toHaveLength(2)
  })
})

describe("LSPAgentTools — code actions", () => {
  test("sends textDocument/codeAction with range + context", async () => {
    const { tools, deliver, lastRequest } = setup()
    const pending = tools.codeActions(
      "file:///a.ts",
      { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
      { diagnostics: [], only: ["quickfix"] },
    )
    const req = lastRequest()
    expect(req.method).toBe("textDocument/codeAction")
    const p = req.params as { context: { only: string[] } }
    expect(p.context.only).toEqual(["quickfix"])
    deliver({ jsonrpc: "2.0", id: req.id, result: [{ title: "Fix it" }] })
    const actions = (await pending) as { title: string }[]
    expect(actions[0]!.title).toBe("Fix it")
  })
})

describe("LSPAgentTools — formatting", () => {
  test("sends textDocument/formatting with default options", async () => {
    const { tools, deliver, lastRequest } = setup()
    const pending = tools.format("file:///a.ts")
    const req = lastRequest()
    expect(req.method).toBe("textDocument/formatting")
    const p = req.params as { options: { tabSize: number; insertSpaces: boolean } }
    expect(p.options.tabSize).toBe(2)
    expect(p.options.insertSpaces).toBe(true)
    deliver({
      jsonrpc: "2.0",
      id: req.id,
      result: [{ range: {}, newText: "formatted" }],
    })
    const edits = (await pending) as { newText: string }[]
    expect(edits[0]!.newText).toBe("formatted")
  })

  test("caller can override formatting options", async () => {
    const { tools, lastRequest } = setup()
    void tools.format("file:///a.ts", { tabSize: 4, insertSpaces: false })
    const p = lastRequest().params as { options: { tabSize: number; insertSpaces: boolean } }
    expect(p.options.tabSize).toBe(4)
    expect(p.options.insertSpaces).toBe(false)
  })
})

describe("LSPAgentTools — additional essentials", () => {
  test("hover sends textDocument/hover", async () => {
    const { tools, deliver, lastRequest } = setup()
    const pending = tools.hover("file:///a.ts", { line: 0, character: 0 })
    const req = lastRequest()
    expect(req.method).toBe("textDocument/hover")
    deliver({ jsonrpc: "2.0", id: req.id, result: { contents: "docs" } })
    expect(await pending).toEqual({ contents: "docs" })
  })

  test("definition sends textDocument/definition", async () => {
    const { tools, deliver, lastRequest } = setup()
    const pending = tools.definition("file:///a.ts", { line: 0, character: 0 })
    const req = lastRequest()
    expect(req.method).toBe("textDocument/definition")
    deliver({ jsonrpc: "2.0", id: req.id, result: [] })
    expect(await pending).toEqual([])
  })

  test("references sends textDocument/references with includeDeclaration", async () => {
    const { tools, deliver, lastRequest } = setup()
    const pending = tools.references("file:///a.ts", { line: 0, character: 0 })
    const req = lastRequest()
    expect(req.method).toBe("textDocument/references")
    const p = req.params as { context: { includeDeclaration: boolean } }
    expect(p.context.includeDeclaration).toBe(true)
    deliver({ jsonrpc: "2.0", id: req.id, result: [] })
    expect(await pending).toEqual([])
  })
})
