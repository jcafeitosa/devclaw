import { chmod, mkdir, rename, stat, unlink } from "node:fs/promises"
import { join } from "node:path"
import { AsyncMutex } from "../util/async_mutex.ts"
import { decrypt, deriveKey, encrypt } from "./file_crypto.ts"
import type { AuthStore } from "./store.ts"
import { type AuthInfo, authKey } from "./types.ts"

export interface FilesystemAuthStoreConfig {
  dir: string
  passphrase: string
  fileName?: string
}

interface Snapshot {
  version: 1
  entries: Record<string, AuthInfo>
}

export class FilesystemAuthStore implements AuthStore {
  private readonly dir: string
  private readonly file: string
  private readonly passphrase: string
  private keyPromise: Promise<CryptoKey> | null = null
  private readonly mu = new AsyncMutex()

  constructor(cfg: FilesystemAuthStoreConfig) {
    this.dir = cfg.dir
    this.file = join(cfg.dir, cfg.fileName ?? "auth.enc")
    this.passphrase = cfg.passphrase
  }

  private key(): Promise<CryptoKey> {
    if (!this.keyPromise) this.keyPromise = deriveKey(this.passphrase)
    return this.keyPromise
  }

  private async readSnapshot(): Promise<Snapshot> {
    const f = Bun.file(this.file)
    if (!(await f.exists())) return { version: 1, entries: {} }
    const blob = await f.arrayBuffer()
    const plaintext = await decrypt(await this.key(), blob)
    return JSON.parse(plaintext) as Snapshot
  }

  private async writeSnapshot(snap: Snapshot): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 })
    const blob = await encrypt(await this.key(), JSON.stringify(snap))
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`
    await Bun.write(tmp, blob)
    await chmod(tmp, 0o600)
    await rename(tmp, this.file)
  }

  private async mutate(fn: (snap: Snapshot) => void): Promise<void> {
    await this.mu.with(async () => {
      const snap = await this.readSnapshot()
      fn(snap)
      await this.writeSnapshot(snap)
    })
  }

  async load(provider: string, accountId?: string): Promise<AuthInfo | null> {
    return this.mu.with(async () => {
      const snap = await this.readSnapshot()
      return snap.entries[authKey(provider, accountId)] ?? null
    })
  }

  async save(provider: string, info: AuthInfo, accountId?: string): Promise<void> {
    await this.mutate((snap) => {
      snap.entries[authKey(provider, accountId)] = info
    })
  }

  async delete(provider: string, accountId?: string): Promise<void> {
    await this.mutate((snap) => {
      delete snap.entries[authKey(provider, accountId)]
    })
  }

  async list(): Promise<Array<{ provider: string; accountId: string; type: AuthInfo["type"] }>> {
    return this.mu.with(async () => {
      const snap = await this.readSnapshot()
      return Object.entries(snap.entries).map(([k, v]) => {
        const [provider, accountId] = k.split("::") as [string, string]
        return { provider, accountId, type: v.type }
      })
    })
  }

  async permissionsOk(): Promise<boolean> {
    try {
      const st = await stat(this.file)
      return (st.mode & 0o777) === 0o600
    } catch {
      return true
    }
  }

  async destroy(): Promise<void> {
    try {
      await unlink(this.file)
    } catch {
      // ignore
    }
  }
}
