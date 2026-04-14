# Design: `devclaw` daemon

> `packages/daemon/`. Elysia HTTP + WS expondo `@devclaw/core`.

## 🎯 Goal

Long-lived HTTP + WS process que multiplexa:
- REST routes (mirror CLI: discover/auth/providers/bridges)
- WS endpoint único com envelope `{channel, payload}` multiplexando: invoke-stream, events-fanout, future ACP/MCP
- Graceful shutdown

ACP + MCP completos ficam em PR separada.

## 🧩 Componentes

1. Elysia app factory `createApp({runtime})` — injeta Runtime para tests
2. Routes:
   - `GET /health` → `{status:"ok"}`
   - `GET /version` → `{version}`
   - `GET /discover?dir=...` → DiscoveryReport
   - `GET /auth` → lista
   - `POST /auth/:provider` → salva `{type:"api", key}` (body)
   - `DELETE /auth/:provider` → remove
   - `GET /providers` → lista
   - `GET /bridges` → lista + availability/auth
   - `POST /invoke` → executa `FallbackStrategy`, retorna `BridgeResponse` agregado
3. WS `/ws` com envelope `{channel:"invoke"|"event", type, payload}` para streaming invoke events
4. Graceful stop (SIGINT/SIGTERM) via `app.stop()`

## 🔒 Invariants

- Auth tokens nunca em response body (só `{type}`)
- WS client perdido → drop subscription sem affect outros
- Errors JSON: `{error: {code, message}}`
- Health never auth-gated
- All long operations use AbortSignal

## 📋 Plan (6 tasks)

| # | Task |
|---|---|
| 1 | Scaffold + Elysia install + app factory + health/version |
| 2 | REST: discover + providers + bridges |
| 3 | REST: auth CRUD |
| 4 | REST: invoke (non-stream) |
| 5 | WS endpoint + envelope + invoke streaming channel |
| 6 | Graceful shutdown + integration tests |

## ✅ DoD

- 0 skip/fail/info/suppressions
- Integration test: spin app on port 0 + HTTP + WS client
