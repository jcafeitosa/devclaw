import { randomBytes } from "node:crypto"
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { FilesystemAuthStore } from "@devclaw/core/auth"
import {
  BridgeRegistry,
  ClaudeCodeBridge,
  FallbackStrategy,
  makeAiderBridge,
  makeCodexBridge,
  makeGeminiBridge,
} from "@devclaw/core/bridge"
import { makeDefaultBudgetEnforcer } from "@devclaw/core/cost"
import { ProviderCatalog, registerBuiltins } from "@devclaw/core/provider"
import { createApp, issueAuthToken } from "./app.ts"

async function loadOrGenerateJwtSecret(home: string): Promise<string> {
  if (process.env.DEVCLAW_DAEMON_JWT_SECRET) return process.env.DEVCLAW_DAEMON_JWT_SECRET
  const path = join(home, "daemon.secret")
  try {
    return (await readFile(path, "utf8")).trim()
  } catch {
    const secret = randomBytes(32).toString("hex")
    await mkdir(home, { recursive: true })
    await writeFile(path, secret, "utf8")
    await chmod(path, 0o600)
    return secret
  }
}

async function loadOrIssueToken(home: string, secret: string): Promise<string> {
  if (process.env.DEVCLAW_DAEMON_TOKEN) return process.env.DEVCLAW_DAEMON_TOKEN
  const path = join(home, "daemon.token")
  try {
    return (await readFile(path, "utf8")).trim()
  } catch {
    const token = await issueAuthToken(secret, { sub: "local-cli" })
    await mkdir(home, { recursive: true })
    await writeFile(path, token, "utf8")
    await chmod(path, 0o600)
    return token
  }
}

async function bootstrap(): Promise<void> {
  const home = join(homedir(), ".devclaw")
  const passphrase = process.env.DEVCLAW_PASSPHRASE
  if (!passphrase && process.env.NODE_ENV === "production") {
    process.stderr.write(
      "refusing to start in production without DEVCLAW_PASSPHRASE (S-04). Set it and retry.\n",
    )
    process.exit(2)
  }
  const authStore = new FilesystemAuthStore({
    dir: home,
    passphrase: passphrase ?? "devclaw-dev",
  })
  const catalog = new ProviderCatalog()
  await registerBuiltins({ catalog, store: authStore })
  const bridges = new BridgeRegistry()
  bridges.register(new ClaudeCodeBridge())
  bridges.register(makeCodexBridge({ authStore }))
  bridges.register(makeGeminiBridge())
  bridges.register(makeAiderBridge())
  const budget = makeDefaultBudgetEnforcer()
  const fallback = new FallbackStrategy({
    registry: bridges,
    catalog,
    fallbackProviderId: catalog.list()[0]?.id,
    budget,
  })

  const jwtSecret = await loadOrGenerateJwtSecret(home)
  const daemonToken = await loadOrIssueToken(home, jwtSecret)

  const app = createApp({
    runtime: { authStore, catalog, bridges, fallback, budget },
    auth: { jwtSecret, requireFromLoopback: true },
  })
  const port = Number(process.env.PORT ?? 4551)
  const hostname = process.env.DEVCLAW_DAEMON_BIND ?? "127.0.0.1"
  const server = app.listen({ port, hostname }, () => {
    process.stdout.write(`devclaw-daemon listening on http://${hostname}:${port}\n`)
    process.stdout.write(`  bearer token (also saved to ${home}/daemon.token):\n`)
    process.stdout.write(`  ${daemonToken}\n`)
  })

  const shutdown = async (signal: string) => {
    process.stdout.write(`received ${signal}, draining in-flight requests\n`)
    app.beginShutdown()
    await app.drain({ timeoutMs: 30_000 })
    const remaining = app.inflight()
    if (remaining > 0) {
      process.stdout.write(`timed out with ${remaining} in-flight; force-closing\n`)
    }
    await server.stop()
    process.exit(remaining > 0 ? 1 : 0)
  }
  process.on("SIGINT", () => void shutdown("SIGINT"))
  process.on("SIGTERM", () => void shutdown("SIGTERM"))
}

if (import.meta.main) {
  bootstrap().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
