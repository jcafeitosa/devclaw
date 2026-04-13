export interface ApiAuth {
  type: "api"
  key: string
  meta?: Record<string, string>
}

export interface OAuthAuth {
  type: "oauth"
  accessToken: string
  refreshToken?: string
  expiresAt: number
  accountId?: string
  enterpriseUrl?: string
  scope?: string
  tokenType?: string
}

export interface WellKnownAuth {
  type: "wellknown"
  entries: Record<string, string>
}

export type AuthInfo = ApiAuth | OAuthAuth | WellKnownAuth

export function isApiAuth(a: AuthInfo): a is ApiAuth {
  return a.type === "api"
}

export function isOAuthAuth(a: AuthInfo): a is OAuthAuth {
  return a.type === "oauth"
}

export function isWellKnownAuth(a: AuthInfo): a is WellKnownAuth {
  return a.type === "wellknown"
}

export function isOAuthExpired(a: OAuthAuth, graceMs = 0): boolean {
  return Date.now() + graceMs >= a.expiresAt
}

export function authKey(provider: string, accountId = "default"): string {
  return `${provider}::${accountId}`
}
