import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "../../src/auth/filesystem_store.ts"
import { codexLogin, makeCodexRefresher } from "../../src/oauth/codex_flow.ts"

interface MockIssuer {
  server: ReturnType<typeof Bun.serve>
  issuer: string
  lastAuthorizeQuery: URLSearchParams | null
}

function startMockIssuer(): MockIssuer {
  const state: { lastAuthorizeQuery: URLSearchParams | null } = { lastAuthorizeQuery: null }
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (req) => {
      const url = new URL(req.url)
      if (url.pathname === "/oauth/authorize") {
        state.lastAuthorizeQuery = url.searchParams
        const redirect = url.searchParams.get("redirect_uri") ?? ""
        const stateParam = url.searchParams.get("state") ?? ""
        const cb = new URL(redirect)
        cb.searchParams.set("code", "MOCK_AUTH_CODE")
        cb.searchParams.set("state", stateParam)
        return new Response(null, { status: 302, headers: { location: cb.toString() } })
      }
      if (url.pathname === "/oauth/token") {
        return new Response(
          JSON.stringify({
            access_token: "ACC_TOK",
            refresh_token: "REF_TOK",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "openid offline_access",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      }
      return new Response("Not found", { status: 404 })
    },
  })
  return {
    server,
    issuer: `http://127.0.0.1:${server.port}`,
    get lastAuthorizeQuery() {
      return state.lastAuthorizeQuery
    },
  } as MockIssuer
}

let issuer: MockIssuer | null = null
let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "devclaw-codex-"))
  issuer = startMockIssuer()
})

afterEach(async () => {
  issuer?.server.stop(true)
  issuer = null
  await rm(dir, { recursive: true, force: true })
})

describe("codexLogin orchestrator", () => {
  test("runs PKCE flow end-to-end and stores OAuthAuth", async () => {
    const store = new FilesystemAuthStore({ dir, passphrase: "pw" })
    const curr = issuer!
    const result = await codexLogin({
      clientId: "codex-test",
      issuer: curr.issuer,
      authorizePath: "/oauth/authorize",
      tokenPath: "/oauth/token",
      ports: [1470, 1471, 1472],
      scopes: ["openid", "offline_access"],
      store,
      provider: "codex",
      timeoutMs: 5_000,
      openBrowser: async (authorizeUrl) => {
        // simulate browser: just fetch the authorize URL to trigger redirect back to callback
        await fetch(authorizeUrl, { redirect: "manual" }).then((r) => {
          const loc = r.headers.get("location")
          if (loc) return fetch(loc)
        })
      },
    })
    expect(result.accessToken).toBe("ACC_TOK")
    expect(result.refreshToken).toBe("REF_TOK")
    expect(result.type).toBe("oauth")
    // PKCE params present on authorize call
    const q = curr.lastAuthorizeQuery
    expect(q?.get("code_challenge_method")).toBe("S256")
    expect(q?.get("code_challenge")?.length).toBe(43)
    // persisted
    const reloaded = await store.load("codex")
    expect(reloaded).toMatchObject({ type: "oauth", accessToken: "ACC_TOK" })
  })
})

describe("makeCodexRefresher", () => {
  test("returns refresher compatible with ensureFreshOAuth signature", async () => {
    const curr = issuer!
    const refresher = makeCodexRefresher({
      clientId: "codex-test",
      tokenEndpoint: `${curr.issuer}/oauth/token`,
    })
    const next = await refresher({
      type: "oauth",
      accessToken: "old",
      refreshToken: "old-refresh",
      expiresAt: 0,
    })
    expect(next.accessToken).toBe("ACC_TOK")
    expect(next.refreshToken).toBe("REF_TOK")
  })
})
