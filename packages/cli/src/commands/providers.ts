import type { BridgeRegistry } from "@devclaw/core/bridge"
import type { ProviderCatalog } from "@devclaw/core/provider"
import type { CommandDef } from "../registry.ts"

export function makeProvidersCommand(getCatalog: () => Promise<ProviderCatalog>): CommandDef {
  return {
    name: "providers",
    describe: "List registered providers",
    async handler({ stdout }) {
      const catalog = await getCatalog()
      const list = catalog.list()
      if (list.length === 0) {
        stdout("(no providers registered — run 'devclaw auth login <provider> --key ...')")
        return 0
      }
      const width = list.reduce((n, p) => Math.max(n, p.id.length), 0)
      for (const p of list) {
        stdout(`${p.id.padEnd(width)}  ${p.defaultModel}  ${p.baseUrl}`)
      }
      return 0
    },
  }
}

export function makeBridgesCommand(getRegistry: () => Promise<BridgeRegistry>): CommandDef {
  return {
    name: "bridges",
    describe: "List CLI bridges + availability",
    async handler({ stdout }) {
      const registry = await getRegistry()
      const list = registry.list()
      const rows: string[] = []
      const width = list.reduce((n, b) => Math.max(n, b.cli.length), 0)
      for (const b of list) {
        const available = await b.isAvailable()
        const auth = await b.isAuthenticated()
        rows.push(
          `${b.cli.padEnd(width)}  ${available ? "✓" : "—"}  ${auth.authed ? "auth" : "unauth"}`,
        )
      }
      stdout(rows.join("\n") || "(no bridges registered)")
      return 0
    },
  }
}
