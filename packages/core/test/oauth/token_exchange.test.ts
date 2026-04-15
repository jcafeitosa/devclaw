import { beforeEach, describe, expect, test } from "bun:test"
import { OAuthTokenError } from "../../src/oauth/errors.ts"
import {
  exchangeCode,
  refreshAccessToken,
  type TokenEndpoint,
} from "../../src/oauth/token_exchange.ts"

let lastBody: Record<string, string> = {}

function startMock(respond: (body: Record<string, string>) => Response) {
  const fetchFn = async (
    _input: string | URL | Request,
    init?: RequestInit | BunFetchRequestInit,
  ) => {
    const json = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>
    lastBody = json
    return respond(json)
  }
  return { endpoint: "http://mock-token.test/token" as TokenEndpoint, fetchFn: fetchFn as unknown as typeof fetch }
}

beforeEach(() => {
  lastBody = {}
})

describe("exchangeCode", () => {
  test("POSTs expected fields and returns OAuthAuth", async () => {
    const { endpoint, fetchFn } = startMock(
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
    const out = await exchangeCode({
      endpoint,
      clientId: "cli",
      code: "AUTHCODE",
      codeVerifier: "VERIFIER",
      redirectUri: "http://localhost:1455/auth/callback",
      fetchFn,
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
    const { endpoint, fetchFn } = startMock(
      () =>
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    )
    const promise = exchangeCode({
      endpoint,
      clientId: "cli",
      code: "bad",
      codeVerifier: "v",
      redirectUri: "r",
      fetchFn,
    })
    await expect(promise).rejects.toBeInstanceOf(OAuthTokenError)
  })
})

describe("refreshAccessToken", () => {
  test("POSTs refresh_token grant and returns fresh OAuthAuth", async () => {
    const { endpoint, fetchFn } = startMock(
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
    const out = await refreshAccessToken({
      endpoint,
      clientId: "cli",
      refreshToken: "old-ref",
      fetchFn,
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
    const { endpoint, fetchFn } = startMock(
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
    const out = await refreshAccessToken({
      endpoint,
      clientId: "cli",
      refreshToken: "persist-me",
      fetchFn,
    })
    expect(out.refreshToken).toBe("persist-me")
  })
})
