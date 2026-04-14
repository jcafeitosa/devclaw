import { afterEach, describe, expect, test } from "bun:test"
import { makeWebFetchTool } from "../../src/tool/builtins/web.ts"

let server: ReturnType<typeof Bun.serve> | null = null

afterEach(() => {
  server?.stop(true)
  server = null
})

function startMock(body: string, contentType = "text/plain") {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(body, { status: 200, headers: { "content-type": contentType } }),
  })
  return `http://127.0.0.1:${server.port}`
}

describe("web_fetch", () => {
  test("fetches allowlisted URL and returns body + status + contentType", async () => {
    const url = startMock("hello")
    const host = new URL(url).host
    const tool = makeWebFetchTool({ allowedHosts: [host] })
    const r = await tool.handler({ url })
    expect(r.body).toBe("hello")
    expect(r.status).toBe(200)
    expect(r.contentType).toContain("text/plain")
  })

  test("rejects host not in allowlist", async () => {
    const url = startMock("x")
    const tool = makeWebFetchTool({ allowedHosts: ["other.example"] })
    await expect(tool.handler({ url })).rejects.toThrow(/not allowed/i)
  })

  test("enforces maxBytes size cap", async () => {
    const big = "a".repeat(5000)
    const url = startMock(big)
    const tool = makeWebFetchTool({
      allowedHosts: [new URL(url).host],
      maxBytes: 1000,
    })
    await expect(tool.handler({ url })).rejects.toThrow(/too large/i)
  })

  test("risk is medium", () => {
    expect(makeWebFetchTool({ allowedHosts: [] }).risk).toBe("medium")
  })
})
