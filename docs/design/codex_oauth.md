# Design: Codex OAuth Bridge

> Phase 1 Module #2 — SDD Stage 1+3.
> Spec refs: `vault://60_provider_connection/oauth_flows`, `vault://61_concrete_adapters/codex_adapter`.

## 🎯 Goal

Local OAuth2 PKCE flow for OpenAI Codex: HTTP server on port **1455** captures browser callback, exchanges code→tokens, stores via our `FilesystemAuthStore` as `OAuthAuth`, reused via `ensureFreshOAuth`.

## 🧭 SDD 9-step

1. **Port:** 1455 primary. Fallback 1456-1460 if busy. Exhausted → `OAuthPortExhaustedError`.
2. **PKCE:** S256, verifier 43 chars URL-safe base64 from `crypto.getRandomValues(32 bytes)`.
3. **State:** 32-char URL-safe base64, in-memory, validated on callback. Mismatch → `OAuthStateMismatchError`.
4. **Scopes:** `openid profile email offline_access`.
5. **Endpoints (configurable, default OpenAI):** issuer `https://auth.openai.com`; authorize `/oauth/authorize`; token `/oauth/token`.
6. **Redirect URI:** `http://localhost:<port>/auth/callback` (port injected).
7. **Browser:** `Bun.$` launches `open`/`xdg-open`/`start`; sem tty → printa URL.
8. **Timeout:** 300s; timer rejeita → server cleanup.
9. **Errors:** `OAuthError` base → `OAuthPortExhaustedError`, `OAuthStateMismatchError`, `OAuthTimeoutError`, `OAuthUserDeniedError`, `OAuthTokenError`, `OAuthBrowserUnavailableError`.

## 🧱 Invariants

- State sempre validado antes de exchange
- Código de autorização nunca logado
- Server para (port liberado) após success OU timeout
- Uma login de cada vez (orchestrator não é re-entrant em port)
- `OAuthAuth` salvo com `expiresAt` = `now + expires_in * 1000`

## 📋 Plan (7 tasks)

| # | Task | Files |
|---|---|---|
| 1 | OAuth errors (discriminated) | `src/oauth/errors.ts` + test |
| 2 | PKCE gen (verifier + S256 challenge) | `src/oauth/pkce.ts` + test |
| 3 | Authorize URL builder | `src/oauth/authorize_url.ts` + test |
| 4 | Callback server (1455 + fallback) | `src/oauth/callback_server.ts` + test |
| 5 | Token exchange (code→tokens) | `src/oauth/token_exchange.ts` + test |
| 6 | Browser opener | `src/oauth/browser.ts` + test |
| 7 | Orchestrator (wire all + refresher fn) | `src/oauth/codex_flow.ts` + test |

Total ~30-40 min.

## ✅ DoD

- 7 tasks green, lint+typecheck clean
- Zero skips, zero suppressions
- Test mock HTTP server serves token endpoint; full flow exercised
- `refresher` function compatible com `ensureFreshOAuth` from auth module

## 🚫 Out-of-scope Phase 1

- CLI command (`devclaw login codex`) — needs packages/cli (future PR)
- Device flow (headless fallback)
- Token revocation
- Enterprise URL override
- Multi-account concurrent OAuth
