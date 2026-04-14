import type { AuthInfo, AuthStore } from "@devclaw/core/auth"
import type { BridgeRegistry, FallbackStrategy } from "@devclaw/core/bridge"
import { discover } from "@devclaw/core/discovery"
import type { ProviderCatalog } from "@devclaw/core/provider"
import { Elysia, t } from "elysia"

export const VERSION = "0.0.0"

export interface DaemonRuntime {
  authStore: AuthStore
  catalog: ProviderCatalog
  bridges: BridgeRegistry
  fallback: FallbackStrategy
}

export interface AppConfig {
  runtime: DaemonRuntime
  version?: string
}

export function createApp(cfg: AppConfig) {
  const version = cfg.version ?? VERSION
  const rt = cfg.runtime

  return new Elysia()
    .get("/health", () => ({ status: "ok" }))
    .get("/version", () => ({ version }))
    .get(
      "/discover",
      async ({ query }) => {
        const dir = typeof query.dir === "string" ? query.dir : process.cwd()
        return discover(dir)
      },
      { query: t.Object({ dir: t.Optional(t.String()) }) },
    )
    .get("/providers", () => ({
      items: rt.catalog.list().map((p) => ({
        id: p.id,
        name: p.name,
        baseUrl: p.baseUrl,
        defaultModel: p.defaultModel,
      })),
    }))
    .get("/bridges", async () => {
      const items = await Promise.all(
        rt.bridges.list().map(async (b) => ({
          cli: b.cli,
          available: await b.isAvailable(),
          authed: (await b.isAuthenticated()).authed,
          capabilities: b.capabilities(),
        })),
      )
      return { items }
    })
    .get("/auth", async () => ({ items: await rt.authStore.list() }))
    .post(
      "/auth/:provider",
      async ({ params, body }) => {
        const account = body.account
        const info: AuthInfo = { type: "api", key: body.key }
        await rt.authStore.save(params.provider, info, account)
        return { saved: true, provider: params.provider, account: account ?? "default" }
      },
      {
        params: t.Object({ provider: t.String() }),
        body: t.Object({
          key: t.String({ minLength: 1 }),
          account: t.Optional(t.String()),
        }),
      },
    )
    .delete(
      "/auth/:provider",
      async ({ params, query }) => {
        const account = typeof query.account === "string" ? query.account : undefined
        await rt.authStore.delete(params.provider, account)
        return { deleted: true, provider: params.provider, account: account ?? "default" }
      },
      {
        params: t.Object({ provider: t.String() }),
        query: t.Object({ account: t.Optional(t.String()) }),
      },
    )
    .post(
      "/invoke",
      async ({ body }) => {
        const events = rt.fallback.execute({
          taskId: body.taskId ?? `task_${Date.now()}`,
          agentId: body.agentId ?? "daemon",
          cli: body.cli,
          cwd: body.cwd ?? process.cwd(),
          prompt: body.prompt,
        })
        const collected: unknown[] = []
        let text = ""
        let errored: string | null = null
        for await (const event of events) {
          collected.push(event)
          if (event.type === "text") text += `${event.content}\n`
          else if (event.type === "error") errored = event.message
        }
        return {
          status: errored ? "error" : "ok",
          text: text.trimEnd(),
          events: collected,
          error: errored,
        }
      },
      {
        body: t.Object({
          prompt: t.String({ minLength: 1 }),
          cli: t.String({ default: "claude" }),
          cwd: t.Optional(t.String()),
          taskId: t.Optional(t.String()),
          agentId: t.Optional(t.String()),
        }),
      },
    )
    .ws("/ws", {
      body: t.Object({
        channel: t.Union([t.Literal("invoke"), t.Literal("ping")]),
        type: t.String(),
        payload: t.Optional(t.Any()),
      }),
      async message(ws, msg) {
        if (msg.channel === "ping") {
          ws.send({ channel: "ping", type: "pong", payload: null })
          return
        }
        if (msg.channel === "invoke" && msg.type === "start") {
          const payload = (msg.payload ?? {}) as {
            prompt?: string
            cli?: "claude" | "codex" | "gemini" | "aider"
            taskId?: string
            cwd?: string
            agentId?: string
          }
          if (!payload.prompt) {
            ws.send({
              channel: "invoke",
              type: "error",
              payload: { message: "missing prompt" },
            })
            ws.send({ channel: "invoke", type: "end", payload: null })
            return
          }
          const events = rt.fallback.execute({
            taskId: payload.taskId ?? `task_${Date.now()}`,
            agentId: payload.agentId ?? "ws",
            cli: payload.cli ?? "claude",
            cwd: payload.cwd ?? process.cwd(),
            prompt: payload.prompt,
          })
          for await (const event of events) {
            ws.send({ channel: "invoke", type: event.type, payload: event })
          }
          ws.send({ channel: "invoke", type: "end", payload: null })
        }
      },
    })
}
