import type { OAuthAuth } from "../auth/types.ts"
import { OAuthTokenError } from "./errors.ts"

export type TokenEndpoint = string

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
  scope?: string
  id_token?: string
}

export interface ExchangeCodeOpts {
  endpoint: TokenEndpoint
  clientId: string
  code: string
  codeVerifier: string
  redirectUri: string
}

export interface RefreshTokenOpts {
  endpoint: TokenEndpoint
  clientId: string
  refreshToken: string
}

async function post(endpoint: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new OAuthTokenError(res.status, text)
  return JSON.parse(text) as TokenResponse
}

function toAuth(resp: TokenResponse, fallbackRefreshToken?: string): OAuthAuth {
  return {
    type: "oauth",
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token ?? fallbackRefreshToken,
    expiresAt: Date.now() + resp.expires_in * 1000,
    tokenType: resp.token_type,
    scope: resp.scope,
  }
}

export async function exchangeCode(opts: ExchangeCodeOpts): Promise<OAuthAuth> {
  const resp = await post(opts.endpoint, {
    grant_type: "authorization_code",
    client_id: opts.clientId,
    code: opts.code,
    code_verifier: opts.codeVerifier,
    redirect_uri: opts.redirectUri,
  })
  return toAuth(resp)
}

export async function refreshAccessToken(opts: RefreshTokenOpts): Promise<OAuthAuth> {
  const resp = await post(opts.endpoint, {
    grant_type: "refresh_token",
    client_id: opts.clientId,
    refresh_token: opts.refreshToken,
  })
  return toAuth(resp, opts.refreshToken)
}
