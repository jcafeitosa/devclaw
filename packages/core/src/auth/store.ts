import type { AuthInfo } from "./types.ts"

export interface AuthStore {
  load(provider: string, accountId?: string): Promise<AuthInfo | null>
  save(provider: string, info: AuthInfo, accountId?: string): Promise<void>
  delete(provider: string, accountId?: string): Promise<void>
  list(): Promise<Array<{ provider: string; accountId: string; type: AuthInfo["type"] }>>
}
