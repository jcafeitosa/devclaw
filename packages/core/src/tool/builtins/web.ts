import type { Tool } from "../types.ts"

export interface WebFetchConfig {
  allowedHosts: string[]
  maxBytes?: number
  timeoutMs?: number
}

export interface WebFetchResult {
  url: string
  status: number
  contentType: string
  body: string
}

export function makeWebFetchTool(
  cfg: WebFetchConfig,
): Tool<{ url: string; method?: string }, WebFetchResult> {
  const maxBytes = cfg.maxBytes ?? 1_048_576
  const allowed = new Set(cfg.allowedHosts.map((h) => h.toLowerCase()))
  const wildcard = allowed.has("*")
  return {
    id: "web_fetch",
    name: "Fetch URL",
    description: "Fetch an allowlisted URL and return its body (size-capped)",
    risk: "medium",
    timeoutMs: cfg.timeoutMs ?? 15_000,
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "HEAD"] },
      },
      required: ["url"],
    },
    async handler({ url, method = "GET" }, _ctx, signal) {
      const parsed = new URL(url)
      const host = parsed.host.toLowerCase()
      if (!wildcard && !allowed.has(host)) {
        throw new Error(`web_fetch: host '${host}' not allowed`)
      }
      const res = await fetch(url, { method, signal })
      const ctype = res.headers.get("content-type") ?? ""
      const buf = await res.arrayBuffer()
      if (buf.byteLength > maxBytes) {
        throw new Error(`web_fetch: response too large (${buf.byteLength} > ${maxBytes})`)
      }
      const body = new TextDecoder().decode(buf)
      return { url, status: res.status, contentType: ctype, body }
    },
  }
}
