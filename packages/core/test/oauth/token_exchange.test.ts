import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { OAuthTokenError } from "../../src/oauth/errors.ts"
import {
  exchangeCode,
  refreshAccessToken,
  type TokenEndpoint,
} from "../../src/oauth/token_exchange.ts"

let mockServer: ReturnType<typeof Bun.serve> | null = null
let lastBody: Record<string, string> = {}

function startMock(respond: (body: Record<string, string>) => Response) {
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (req) => {
      const json = (await req.json()) as Record<string, string>
      lastBody = json
      return respond(json)
    },
  })
}

afterEach(() => {
  mockServer?.stop(true)
  mockServer = null
  lastBody = {}
})

beforeEach(() => {
  lastBody = {}
})

describe("exchangeCode", () => {
  test("POSTs expected fields and returns OAuthAuth", async () => {
    mockServer = startMock(
      () =>
        new Response(
          JSON.stringify({
            access_token: "acc",
            refresh_token: "ref",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "openid offline_access",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const endpoint: TokenEndpoint = `http://127.0.0.1:${mockServer.port}/token`
    const out = await exchangeCode({
      endpoint,
      clientId: "cli",
      code: "AUTHCODE",
      codeVerifier: "VERIFIER",
      redirectUri: "http://localhost:1455/auth/callback",
    })
    expect(lastBody).toMatchObject({
      grant_type: "authorization_code",
      client_id: "cli",
      code: "AUTHCODE",
      code_verifier: "VERIFIER",
      redirect_uri: "http://localhost:1455/auth/callback",
    })
    expect(out.type).toBe("oauth")
    expect(out.accessToken).toBe("acc")
    expect(out.refreshToken).toBe("ref")
    expect(out.tokenType).toBe("Bearer")
    expect(out.scope).toBe("openid offline_access")
    expect(out.expiresAt).toBeGreaterThan(Date.now())
    expect(out.expiresAt).toBeLessThanOrEqual(Date.now() + 3_600_000 + 1000)
  })

  test("throws OAuthTokenError on non-2xx", async () => {
    mockServer = startMock(
      () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    )
    const endpoint: TokenEndpoint = `http://127.0.0.1:${mockServer.port}/token`
    const promise = exchangeCode({
      endpoint,
      clientId: "cli",
      code: "bad",
      codeVerifier: "v",
      redirectUri: "r",
    })
    await expect(promise).rejects.toBeInstanceOf(OAuthTokenError)
  })
})

describe("refreshAccessToken", () => {
  test("POSTs refresh_token grant and returns fresh OAuthAuth", async () => {
    mockServer = startMock(
      () =>
        new Response(
          JSON.stringify({
            access_token: "new-acc",
            refresh_token: "new-ref",
            expires_in: 1800,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const endpoint: TokenEndpoint = `http://127.0.0.1:${mockServer.port}/token`
    const out = await refreshAccessToken({
      endpoint,
      clientId: "cli",
      refreshToken: "old-ref",
    })
    expect(lastBody).toMatchObject({
      grant_type: "refresh_token",
      client_id: "cli",
      refresh_token: "old-ref",
    })
    expect(out.accessToken).toBe("new-acc")
    expect(out.refreshToken).toBe("new-ref")
  })

  test("preserves old refresh_token when server omits it", async () => {
    mockServer = startMock(
      () =>
        new Response(
          JSON.stringify({
            access_token: "new-acc",
            expires_in: 1800,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    )
    const endpoint: TokenEndpoint = `http://127.0.0.1:${mockServer.port}/token`
    const out = await refreshAccessToken({
      endpoint,
      clientId: "cli",
      refreshToken: "persist-me",
    })
    expect(out.refreshToken).toBe("persist-me")
  })
})
