# Design: Tool System

> Full-spec per `vault://06_agent_os/tool_system`. Não-MVP.

## 🎯 Goal

Tool catalog + executor + permission gate que o Cognitive Engine chama. Cada tool: schema declarativo (nome, input, output, risk, cost), handler tipado, validated invocation, audit/events.

## 🧩 Componentes

1. **Tool schema** (types): `Tool<I, O>`, `ToolSchema`, `RiskLevel`, `ToolResult`, `ToolError` (4 subclasses: validation, permission, timeout, exec)
2. **ToolRegistry**: register/unregister/get/list/replace; hot-reload por id.
3. **PermissionChecker**: agent-scoped allow/deny + risk gating (`low/medium/high/critical`); `high+critical` exigem approval callback.
4. **ToolExecutor**: input validation via schema; permission check; spawn com timeout (`AbortController`); measure latency; emit events (`tool_called`, `tool_completed`, `tool_failed`); audit entry.
5. **EventEmitter** primitivo (listeners typed) — reusável pelo resto do agent OS.
6. **Built-in tools**: `fs_read`, `fs_write`, `fs_list`, `shell_exec` (allowlist), `web_fetch`.
7. **Approval hook**: callback `(tool, args) => Promise<"allow" | "deny">` — CE/user wires this.

## 🔒 Invariants

- Nenhuma tool roda sem registry → permission → executor path
- `fs_write` / `shell_exec` são `high` por default → approval obrigatório (unless allowlisted)
- Every invocation → audit entry (via `AuditLog` já shipped)
- Schema validation antes de handler (fail-closed)
- Timeout default 30s, override por tool

## 📋 Plan (8 tasks)

| # | Task | Arquivos |
|---|---|---|
| 1 | Tool schema types + 4 error classes | `src/tool/types.ts` + `errors.ts` + tests |
| 2 | Simple schema validator (no deps) | `src/tool/validate.ts` + test |
| 3 | Typed `EventEmitter` util | `src/util/event_emitter.ts` + test |
| 4 | `ToolRegistry` (register/get/list/replace/unregister) | `src/tool/registry.ts` + test |
| 5 | `PermissionChecker` (allow/deny + risk + approval) | `src/tool/permission.ts` + test |
| 6 | `ToolExecutor` (validate + permit + exec + timeout + events + audit) | `src/tool/executor.ts` + test |
| 7 | Built-ins: fs_read, fs_write, fs_list | `src/tool/builtins/fs.ts` + tests |
| 8 | Built-ins: shell_exec (allowlist), web_fetch | `src/tool/builtins/shell.ts` + `web.ts` + tests |

## ✅ DoD

- 8 tasks green, zero skip/fail/info/suppressions
- Coverage dos error paths (validation, permission denied, timeout, exec fail)
- Built-ins testados contra real fs (tmpdir) + mock servers
