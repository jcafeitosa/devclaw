import { randomBytes } from "node:crypto"
import type { AuthInfo, AuthStore } from "@devclaw/core/auth"
import type { BridgeRegistry, CliId, FallbackStrategy } from "@devclaw/core/bridge"
import {
  ConsensusNoBridgesError,
  type ConsensusScorer,
  makeLLMJudgeScorer,
  runConsensus,
} from "@devclaw/core/consensus"
import { discover } from "@devclaw/core/discovery"
import {
  ACPServer,
  type BuiltinToolBackends,
  MCPServer,
  registerBuiltinTools,
} from "@devclaw/core/protocol"
import type { ProviderCatalog } from "@devclaw/core/provider"
import { bearer } from "@elysiajs/bearer"
import { jwt } from "@elysiajs/jwt"
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
  mcpBackends?: BuiltinToolBackends
  auth?: {
    jwtSecret?: string
    /**
     * When true, loopback requests (127.0.0.1 / localhost / ::1) ALSO require
     * a valid bearer token. Closes CVSS 7.3 local-process attack vector (S-02).
     * Defaults to false for backward compat; bin.ts enables it in production.
     */
    requireFromLoopback?: boolean
  }
}

const DEFAULT_JWT_SECRET = randomBytes(32).toString("hex")

function isLoopback(req: Request): boolean {
  const url = new URL(req.url)
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1") {
    return true
  }
  return false
}

function authSecret(cfg: AppConfig): string {
  return cfg.auth?.jwtSecret ?? process.env.DEVCLAW_DAEMON_JWT_SECRET ?? DEFAULT_JWT_SECRET
}

function consensusScorer(rt: DaemonRuntime, goal: string): ConsensusScorer {
  const judgeProvider = rt.catalog.list()[0]
  if (!judgeProvider) {
    return async (_cli, text) => {
      if (text.length === 0) return 0
      return 0.1 + (Math.min(text.length, 2000) / 2000) * 0.9
    }
  }
  return makeLLMJudgeScorer({
    catalog: rt.catalog,
    providerId: judgeProvider.id,
    goal,
  })
}

export async function issueAuthToken(secret: string, claims: Record<string, unknown> = {}) {
  const signer = new Elysia().use(
    jwt({
      name: "auth",
      secret,
    }),
  )

  return signer.decorator.auth.sign({
    scope: "daemon",
    ...claims,
  })
}

export interface ShutdownControls {
  beginShutdown(): void
  isShuttingDown(): boolean
  inflight(): number
  drain(opts?: { timeoutMs?: number; pollMs?: number }): Promise<void>
}

export type DaemonApp = ReturnType<typeof buildElysiaApp> & ShutdownControls

function buildElysiaApp(cfg: AppConfig) {
  const version = cfg.version ?? VERSION
  const rt = cfg.runtime
  const acp = new ACPServer({ agentName: "devclaw", agentVersion: version })
  const mcp = new MCPServer({ serverName: "devclaw-mcp", serverVersion: version })
  registerBuiltinTools(mcp, cfg.mcpBackends ?? {})
  const secret = authSecret(cfg)
  const requireFromLoopback = cfg.auth?.requireFromLoopback ?? false
  const shutdownState = {
    shuttingDown: false,
    inflight: 0,
  }
  const DRAINABLE_ROUTES = new Set(["/invoke", "/consensus"])

  const app = new Elysia()
    .use(bearer())
    .use(
      jwt({
        name: "auth",
        secret,
      }),
    )
    .onBeforeHandle(async ({ auth, bearer, request, set }) => {
      if (request.method === "GET" && new URL(request.url).pathname === "/health") return
      if (!requireFromLoopback && isLoopback(request)) return
      if (!bearer) {
        set.status = 401
        set.headers["www-authenticate"] = 'Bearer realm="devclaw", error="invalid_request"'
        return { error: "missing bearer token" }
      }

      const claims = await auth.verify(bearer)
      if (!claims) {
        set.status = 401
        set.headers["www-authenticate"] = 'Bearer realm="devclaw", error="invalid_token"'
        return { error: "invalid bearer token" }
      }
    })
    .onBeforeHandle(({ request, set }) => {
      const pathname = new URL(request.url).pathname
      if (!DRAINABLE_ROUTES.has(pathname)) return
      if (shutdownState.shuttingDown) {
        set.status = 503
        return { error: "daemon is shutting down" }
      }
      shutdownState.inflight++
    })
    .onAfterHandle(({ request }) => {
      const pathname = new URL(request.url).pathname
      if (!DRAINABLE_ROUTES.has(pathname)) return
      if (shutdownState.inflight > 0) shutdownState.inflight--
    })
    .onError(({ request }) => {
      const pathname = new URL(request.url).pathname
      if (!DRAINABLE_ROUTES.has(pathname)) return
      if (shutdownState.inflight > 0) shutdownState.inflight--
    })
    .get("/health", () => ({
      status: "ok",
      ...(shutdownState.shuttingDown ? { shuttingDown: true } : {}),
    }))
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
    .post(
      "/consensus",
      async ({ body, status }) => {
        try {
          const scorer = consensusScorer(rt, body.prompt)
          const result = await runConsensus(
            { bridges: rt.bridges, scorer, clis: body.clis as CliId[] | undefined },
            {
              taskId: body.taskId ?? `task_${Date.now()}`,
              agentId: body.agentId ?? "daemon",
              cli: "claude",
              cwd: body.cwd ?? process.cwd(),
              prompt: body.prompt,
            },
          )
          return { status: "ok", ...result }
        } catch (err) {
          if (err instanceof ConsensusNoBridgesError) {
            return status(400, { status: "error", error: err.message })
          }
          throw err
        }
      },
      {
        body: t.Object({
          prompt: t.String({ minLength: 1 }),
          clis: t.Optional(t.Array(t.String())),
          taskId: t.Optional(t.String()),
          agentId: t.Optional(t.String()),
          cwd: t.Optional(t.String()),
        }),
      },
    )
    .ws("/acp", {
      async message(ws, msg) {
        const raw = typeof msg === "string" ? msg : JSON.stringify(msg)
        const reply = await acp.handle(raw)
        if (reply) ws.send(reply)
      },
    })
    .ws("/mcp", {
      async message(ws, msg) {
        const raw = typeof msg === "string" ? msg : JSON.stringify(msg)
        const reply = await mcp.handle(raw)
        if (reply) ws.send(reply)
      },
    })
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

  return { app, shutdownState }
}

export function createApp(cfg: AppConfig): DaemonApp {
  const { app, shutdownState } = buildElysiaApp(cfg)

  const controls: ShutdownControls = {
    beginShutdown() {
      shutdownState.shuttingDown = true
    },
    isShuttingDown() {
      return shutdownState.shuttingDown
    },
    inflight() {
      return shutdownState.inflight
    },
    async drain({ timeoutMs = 30_000, pollMs = 20 } = {}) {
      const deadline = Date.now() + timeoutMs
      while (shutdownState.inflight > 0 && Date.now() < deadline) {
        await Bun.sleep(pollMs)
      }
    },
  }

  return Object.assign(app, controls) as DaemonApp
}
