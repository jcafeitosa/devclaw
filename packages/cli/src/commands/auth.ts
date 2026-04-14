import type { AuthStore } from "@devclaw/core/auth"
import type { CommandDef } from "../registry.ts"

export function makeAuthCommand(getStore: () => Promise<AuthStore>): CommandDef {
  return {
    name: "auth",
    describe: "Manage stored credentials",
    usage: "devclaw auth <list|login|logout> [args]",
    flags: [
      { name: "key", describe: "API key for login" },
      { name: "account", describe: "Account namespace" },
    ],
    async handler({ args, stdout, stderr }) {
      const sub = args.positional[0]
      const store = await getStore()
      if (sub === "list") {
        const entries = await store.list()
        if (entries.length === 0) stdout("(no credentials stored)")
        for (const e of entries) {
          stdout(`${e.provider}::${e.accountId}  (${e.type})`)
        }
        return 0
      }
      if (sub === "login") {
        const provider = args.positional[1]
        const key = typeof args.flags.key === "string" ? args.flags.key : undefined
        if (!provider || !key) {
          stderr("usage: devclaw auth login <provider> --key <apiKey> [--account name]")
          return 2
        }
        const account = typeof args.flags.account === "string" ? args.flags.account : undefined
        await store.save(provider, { type: "api", key }, account)
        stdout(`saved api key for ${provider}${account ? `::${account}` : ""}`)
        return 0
      }
      if (sub === "logout") {
        const provider = args.positional[1]
        if (!provider) {
          stderr("usage: devclaw auth logout <provider> [--account name]")
          return 2
        }
        const account = typeof args.flags.account === "string" ? args.flags.account : undefined
        await store.delete(provider, account)
        stdout(`removed ${provider}${account ? `::${account}` : ""}`)
        return 0
      }
      stderr(`unknown auth subcommand: ${sub ?? "(missing)"}`)
      return 2
    },
  }
}
