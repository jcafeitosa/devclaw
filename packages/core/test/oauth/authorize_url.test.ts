import { describe, expect, test } from "bun:test"
import { buildAuthorizeUrl } from "../../src/oauth/authorize_url.ts"

describe("buildAuthorizeUrl", () => {
  test("emits expected query params", () => {
    const url = buildAuthorizeUrl({
      issuer: "https://auth.openai.com",
      authorizePath: "/oauth/authorize",
      clientId: "cli-app",
      redirectUri: "http://localhost:1455/auth/callback",
      scopes: ["openid", "profile", "email", "offline_access"],
      codeChallenge: "CHAL",
      state: "STATE",
    })
    const parsed = new URL(url)
    expect(parsed.origin).toBe("https://auth.openai.com")
    expect(parsed.pathname).toBe("/oauth/authorize")
    const q = parsed.searchParams
    expect(q.get("response_type")).toBe("code")
    expect(q.get("client_id")).toBe("cli-app")
    expect(q.get("redirect_uri")).toBe("http://localhost:1455/auth/callback")
    expect(q.get("scope")).toBe("openid profile email offline_access")
    expect(q.get("code_challenge")).toBe("CHAL")
    expect(q.get("code_challenge_method")).toBe("S256")
    expect(q.get("state")).toBe("STATE")
  })

  test("URL-encodes redirect_uri and state properly", () => {
    const url = buildAuthorizeUrl({
      issuer: "https://auth.openai.com",
      authorizePath: "/oauth/authorize",
      clientId: "x",
      redirectUri: "http://localhost:1455/auth/callback?extra=1",
      scopes: ["openid"],
      codeChallenge: "c",
      state: "s+/&=",
    })
    expect(url).toContain(
      "redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback%3Fextra%3D1",
    )
    expect(url).toContain("state=s%2B%2F%26%3D")
  })
})
