import { describe, expect, test } from "bun:test"
import { ACPClient } from "../../src/protocol/acp_client.ts"
import { errorResponse, JsonRpcError, successResponse } from "../../src/protocol/jsonrpc.ts"

function mkClient() {
  const sent: string[] = []
  const client = new ACPClient({
    send: (raw) => {
      sent.push(raw)
    },
  })
  return { client, sent }
}

describe("ACPClient", () => {
  test("call resolves with result when response arrives", async () => {
    const { client, sent } = mkClient()
    const pending = client.call<{ ok: true }>("ping", { n: 1 })
    expect(sent).toHaveLength(1)
    const req = JSON.parse(sent[0]!)
    expect(req.method).toBe("ping")
    expect(req.params).toEqual({ n: 1 })
    client.handleMessage(JSON.stringify(successResponse(req.id, { ok: true })))
    expect(await pending).toEqual({ ok: true })
  })

  test("call rejects with JsonRpcError on error response", async () => {
    const { client, sent } = mkClient()
    const pending = client.call("boom")
    const req = JSON.parse(sent[0]!)
    const err = JsonRpcError.invalidParams("bad")
    client.handleMessage(JSON.stringify(errorResponse(req.id, err)))
    await expect(pending).rejects.toMatchObject({ code: -32602, message: "bad" })
  })

  test("notify sends message without id and returns void", () => {
    const { client, sent } = mkClient()
    client.notify("heartbeat", { t: 1 })
    const msg = JSON.parse(sent[0]!)
    expect(msg.method).toBe("heartbeat")
    expect(msg.id).toBeUndefined()
  })

  test("unknown response id is ignored", () => {
    const { client } = mkClient()
    expect(() => client.handleMessage(JSON.stringify(successResponse(9999, {})))).not.toThrow()
  })

  test("ids are monotonically unique per client", async () => {
    const { client, sent } = mkClient()
    client.call("a")
    client.call("b")
    const a = JSON.parse(sent[0]!).id
    const b = JSON.parse(sent[1]!).id
    expect(a).not.toBe(b)
  })

  test("close rejects all pending calls", async () => {
    const { client } = mkClient()
    const p = client.call("slow")
    client.close(new Error("disconnected"))
    await expect(p).rejects.toThrow("disconnected")
  })

  test("incoming request invokes onRequest handler", async () => {
    const sent: string[] = []
    const client = new ACPClient({
      send: (raw) => {
        sent.push(raw)
      },
      onRequest: async (method, params) => ({ echoed: method, params }),
    })
    await client.handleMessage(
      JSON.stringify({ jsonrpc: "2.0", id: 42, method: "probe", params: { x: 1 } }),
    )
    const reply = JSON.parse(sent[0]!)
    expect(reply.id).toBe(42)
    expect(reply.result).toEqual({ echoed: "probe", params: { x: 1 } })
  })

  test("incoming request with no handler replies MethodNotFound", async () => {
    const sent: string[] = []
    const client = new ACPClient({
      send: (raw) => {
        sent.push(raw)
      },
    })
    await client.handleMessage(JSON.stringify({ jsonrpc: "2.0", id: 7, method: "x" }))
    const reply = JSON.parse(sent[0]!)
    expect(reply.error?.code).toBe(-32601)
  })

  test("incoming notification invokes onNotification and sends nothing", async () => {
    const sent: string[] = []
    let seen: { method: string; params: unknown } | null = null as {
      method: string
      params: unknown
    } | null
    const client = new ACPClient({
      send: (raw) => {
        sent.push(raw)
      },
      onNotification: (method, params) => {
        seen = { method, params }
      },
    })
    await client.handleMessage(
      JSON.stringify({ jsonrpc: "2.0", method: "event", params: { k: 1 } }),
    )
    expect(seen).toEqual({ method: "event", params: { k: 1 } })
    expect(sent).toHaveLength(0)
  })
})
