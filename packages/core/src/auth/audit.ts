import { appendFile, chmod, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { AsyncMutex } from "../util/async_mutex.ts"

export type AuditEventName =
  | "auth.save"
  | "auth.load"
  | "auth.delete"
  | "auth.list"
  | "auth.refresh.begin"
  | "auth.refresh.success"
  | "auth.refresh.fail"
  | "tool.invoke.ok"
  | "tool.invoke.fail"
  | "tool.register"
  | "tool.replace"
  | "tool.remove"

export interface AuditEvent {
  event: AuditEventName
  provider: string
  accountId: string
  meta?: Record<string, string>
}

export interface AuditLogConfig {
  dir: string
  fileName?: string
}

const SECRET_KEYS = new Set([
  "key",
  "apikey",
  "api_key",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "token",
  "passphrase",
  "password",
  "secret",
  "authorization",
])

function scrub(meta: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!meta) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEYS.has(k.toLowerCase())) continue
    if (typeof v === "string") out[k] = v
    else out[k] = String(v)
  }
  return out
}

export class AuditLog {
  private readonly file: string
  private readonly dir: string
  private readonly mu = new AsyncMutex()
  private initialized = false

  constructor(cfg: AuditLogConfig) {
    this.dir = cfg.dir
    this.file = join(cfg.dir, cfg.fileName ?? "audit.log")
  }

  async append(event: AuditEvent): Promise<void> {
    await this.mu.with(async () => {
      if (!this.initialized) {
        await mkdir(this.dir, { recursive: true, mode: 0o700 })
        this.initialized = true
      }
      const line = {
        ts: Date.now(),
        correlationId: crypto.randomUUID(),
        event: event.event,
        provider: event.provider,
        accountId: event.accountId,
        meta: scrub(event.meta as Record<string, unknown> | undefined),
      }
      await appendFile(this.file, `${JSON.stringify(line)}\n`, { mode: 0o600 })
      await chmod(this.file, 0o600).catch(() => {})
    })
  }
}
