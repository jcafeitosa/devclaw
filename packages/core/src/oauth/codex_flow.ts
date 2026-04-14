import type { AuthStore } from "../auth/store.ts"
import type { OAuthAuth } from "../auth/types.ts"
import { buildAuthorizeUrl } from "./authorize_url.ts"
import { openBrowser as defaultOpenBrowser } from "./browser.ts"
import { CallbackServer } from "./callback_server.ts"
import { generatePKCE, generateState } from "./pkce.ts"
import { exchangeCode, refreshAccessToken } from "./token_exchange.ts"

export interface CodexLoginOpts {
  clientId: string
  issuer: string
  authorizePath: string
  tokenPath: string
  ports: number[]
  scopes: string[]
  store: AuthStore
  provider: string
  accountId?: string
  timeoutMs?: number
  openBrowser?: (url: string) => Promise<void> | void
}

export async function codexLogin(opts: CodexLoginOpts): Promise<OAuthAuth> {
  const pkce = await generatePKCE()
  const state = generateState()
  const server = new CallbackServer({
    ports: opts.ports,
    state,
    timeoutMs: opts.timeoutMs ?? 300_000,
  })
  const { redirectUri } = await server.start()
  try {
    const authorizeUrl = buildAuthorizeUrl({
      issuer: opts.issuer,
      authorizePath: opts.authorizePath,
      clientId: opts.clientId,
      redirectUri,
      scopes: opts.scopes,
      codeChallenge: pkce.challenge,
      state,
    })
    const waiter = server.wait()
    const opener = opts.openBrowser ?? ((url: string) => defaultOpenBrowser({ url }))
    const launch = Promise.resolve(opener(authorizeUrl))
    const [, code] = await Promise.all([launch, waiter])
    const auth = await exchangeCode({
      endpoint: `${opts.issuer}${opts.tokenPath}`,
      clientId: opts.clientId,
      code,
      codeVerifier: pkce.verifier,
      redirectUri,
    })
    await opts.store.save(opts.provider, auth, opts.accountId)
    return auth
  } finally {
    await server.close()
  }
}

export interface CodexRefresherOpts {
  clientId: string
  tokenEndpoint: string
}

export function makeCodexRefresher(
  opts: CodexRefresherOpts,
): (current: OAuthAuth) => Promise<OAuthAuth> {
  return async (current) => {
    if (!current.refreshToken) throw new Error("codex: no refresh token available")
    return refreshAccessToken({
      endpoint: opts.tokenEndpoint,
      clientId: opts.clientId,
      refreshToken: current.refreshToken,
    })
  }
}
