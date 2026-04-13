# Design: Auth Storage

> Stage 1 (SDD brainstorm) + Stage 3 (writing plan).
> Spec refs: `vault://09_security/_README`, `vault://18_decisions/adr_008` (WorkOS+Auth.js high-level), `vault://42_cli_bridge/` (token usage context).

## 🎯 Goal

Persist credentials for 3 auth types (`api` / `oauth` / `wellknown`) to disk, encrypted, with atomic writes, multi-account namespacing, and concurrency-safe token refresh.

## 🧭 SDD 9-step (answered — ✋ = needs user confirmation)

### 1. Backends suportados dia 1?
**Default:** filesystem only (`~/.devclaw/auth.json` + optional sibling files por namespace). SQLite upgrade depois via adapter.
Rationale: zero deps extras, simplicidade, solo-dev pivot.

### 2. Encryption at rest?
**Default:** AES-256-GCM com chave derivada de passphrase (Argon2id via `Bun.password`) OU keychain do SO via `security` (macOS) / `libsecret` (Linux) — abstrair atrás de `SecretProvider` adapter; default filesystem com chave derivada.
Rationale: evita deps pesadas; keychain é upgrade opt-in.

### 3. File permissions?
**0600** mandatory. Criação com `mode: 0o600`, verificação ao ler, erro hard se world-readable.
Rationale: baseline segurança; auditável.

### 4. Multi-account?
**Namespace key:** `<provider>::<accountId>` (e.g. `anthropic::personal`, `anthropic::work`). `default` quando omitido.
Rationale: usuário pode ter Claude Pro pessoal + Max via empresa.

### 5. Concurrent refresh?
**Mutex por `<provider>::<accountId>`** (in-process `AsyncMutex`). Se for sidecar/distributed futuro, troca por Redis lock (adapter).
Rationale: evita two refreshes racing + token burn.

### 6. Arquivo deletado manualmente?
**Graceful:** `load()` retorna `null`, não joga. CLI re-prompta login. Logar warn em audit.
Rationale: recuperação sem panic.

### 7. Migração entre máquinas?
**Out-of-scope Phase 1.** `devclaw auth export` + `auth import` (plain JSON após passphrase prompt) vem em Phase 6 (polish).
Rationale: scope cut.

### 8. Validação por tipo?
```ts
type AuthInfo =
  | { type: "api"; key: string; meta?: Record<string,string> }
  | { type: "oauth"; accessToken: string; refreshToken?: string; expiresAt: number; accountId?: string; enterpriseUrl?: string }
  | { type: "wellknown"; entries: Record<string,string> }  // arbitrary key/token pairs
```
Validar via Bun-native (sem Zod dep) — `satisfies` + guards. Adicionar Zod só se precisar runtime schema externo.

### 9. Audit log?
**Sim:** `~/.devclaw/audit.log` append-only, NDJSON. Events: `auth.save`, `auth.load`, `auth.delete`, `auth.refresh.begin`, `auth.refresh.success`, `auth.refresh.fail`. Sem valores de tokens — só `{ts, event, provider, accountId, correlationId}`.
Rationale: security compliance + debugging.

## 🧱 Invariants

- Arquivo auth **nunca** em plaintext em disco (encrypted container).
- `save()` é atomic: write tempfile → fsync → rename.
- `load()` que falha decryption retorna `null` + audit entry (não throw) — caller decide.
- Concurrency: um refresh in-flight por `(provider, accountId)` em qualquer momento.
- Permissions: arquivo 0600 sempre; pasta `~/.devclaw/` 0700.

## 📋 Writing plan (9 tasks, 2-5 min cada)

| # | Task | Files | TDD test |
|---|---|---|---|
| 1 | `AuthInfo` discriminated union + narrow guards | `packages/core/src/auth/types.ts` + `test/auth/types.test.ts` | guards return correct type per input |
| 2 | `AuthStore` interface (load/save/delete/list) | `packages/core/src/auth/store.ts` | interface compiles + exports |
| 3 | `AsyncMutex` util (concurrency primitive) | `packages/core/src/util/async_mutex.ts` + test | serializes 2 concurrent holders |
| 4 | `FileCrypto` (AES-256-GCM encrypt/decrypt) via Web Crypto | `packages/core/src/auth/file_crypto.ts` + test | roundtrip + tamper detection |
| 5 | `FilesystemAuthStore` impl (atomic write, 0600, namespace) | `packages/core/src/auth/filesystem_store.ts` + test | full lifecycle + permissions check |
| 6 | Concurrent refresh guard (mutex wired into store) | same file + test | 2 concurrent refresh → single refresh call |
| 7 | `AuditLog` (NDJSON append, no-secrets) | `packages/core/src/auth/audit.ts` + test | writes event without token values |
| 8 | Barrel export + index wiring | `packages/core/src/auth/index.ts` | module resolves |
| 9 | Manual E2E smoke (real file on tmp) | `test/auth/e2e.test.ts` | save → kill process → reload → match |

**Total estimate:** ~90 min TDD clean.

## ✅ Definition of Done

- [ ] All 9 tasks green (tests + lint + typecheck)
- [ ] Coverage ≥95% em `packages/core/src/auth/` (core/security threshold)
- [ ] `bun run lint` + `bun typecheck` + full `bun test` clean locally
- [ ] CI green on PR
- [ ] Code review: 0 critical, 0 major unresolved
- [ ] Squash-merged to main, branch deleted

## 🚫 Out-of-scope (cut for Phase 1)

- Keychain integration (SecretProvider adapter stubbed, default filesystem)
- Cross-machine export/import (Phase 6)
- OAuth device flow (only PKCE on port 1455 for Codex, next module)
- UI/TUI for auth management (Phase 6)
- Redis-backed mutex (only in-process; upgrade when distributed)
