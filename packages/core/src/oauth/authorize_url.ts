export interface AuthorizeUrlOpts {
  issuer: string
  authorizePath: string
  clientId: string
  redirectUri: string
  scopes: string[]
  codeChallenge: string
  state: string
}

export function buildAuthorizeUrl(opts: AuthorizeUrlOpts): string {
  const url = new URL(opts.authorizePath, opts.issuer)
  const q = url.searchParams
  q.set("response_type", "code")
  q.set("client_id", opts.clientId)
  q.set("redirect_uri", opts.redirectUri)
  q.set("scope", opts.scopes.join(" "))
  q.set("code_challenge", opts.codeChallenge)
  q.set("code_challenge_method", "S256")
  q.set("state", opts.state)
  return url.toString()
}
