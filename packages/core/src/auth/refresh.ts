import { KeyedAsyncMutex } from "../util/async_mutex.ts"
import type { AuthStore } from "./store.ts"
import { authKey, isOAuthAuth, isOAuthExpired, type OAuthAuth } from "./types.ts"

export type Refresher = (current: OAuthAuth) => Promise<OAuthAuth>

const mu = new KeyedAsyncMutex()

export async function ensureFreshOAuth(
  store: AuthStore,
  provider: string,
  accountId: string | undefined,
  refresher: Refresher,
  graceMs = 30_000,
): Promise<OAuthAuth> {
  return mu.with(authKey(provider, accountId), async () => {
    const current = await store.load(provider, accountId)
    if (!current) throw new Error(`auth: not found for ${provider}::${accountId ?? "default"}`)
    if (!isOAuthAuth(current)) {
      throw new Error(`auth: expected oauth for ${provider}, got ${current.type}`)
    }
    if (!isOAuthExpired(current, graceMs)) return current
    const refreshed = await refresher(current)
    await store.save(provider, refreshed, accountId)
    return refreshed
  })
}
