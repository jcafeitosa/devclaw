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
import { ProviderCatalog, registerBuiltins } from "@devclaw/core/provider"
import { createApp } from "./app.ts"

async function bootstrap(): Promise<void> {
  const home = join(homedir(), ".devclaw")
  const authStore = new FilesystemAuthStore({
    dir: home,
    passphrase: process.env.DEVCLAW_PASSPHRASE ?? "devclaw-dev",
  })
  const catalog = new ProviderCatalog()
  await registerBuiltins({ catalog, store: authStore })
  const bridges = new BridgeRegistry()
  bridges.register(new ClaudeCodeBridge())
  bridges.register(makeCodexBridge({ authStore }))
  bridges.register(makeGeminiBridge())
  bridges.register(makeAiderBridge())
  const fallback = new FallbackStrategy({
    registry: bridges,
    catalog,
    fallbackProviderId: catalog.list()[0]?.id,
  })
  const app = createApp({ runtime: { authStore, catalog, bridges, fallback } })
  const port = Number(process.env.PORT ?? 4551)
  const server = app.listen(port, () => {
    process.stdout.write(`devclaw-daemon listening on :${port}\n`)
  })

  const shutdown = async (signal: string) => {
    process.stdout.write(`received ${signal}, shutting down\n`)
    await server.stop()
    process.exit(0)
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
