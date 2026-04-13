# Devclaw

Autonomous software development team for solo developers.

**Pre-alpha, Phase 1.** Stack: Bun 1.3 · Elysia 1.4 · Astro 6 · TypeScript 6 · Biome 2 · Turborepo 2.9.

Spec canonical: Obsidian vault (`10 Projects/DevClaud/`). Local bootstrap: `CLAUDE.md`.

## Dev

```bash
bun install
bun test
bun typecheck
bun lint
```

Redis integration tests:

```bash
BUN_TEST_REDIS=redis://localhost:6379 bun test
```

## Structure

```
packages/core/        # Runtime primitives (queue, idempotency, ...)
packages/daemon/      # Elysia HTTP + WS daemon      (pending)
packages/cli/         # `devclaw` CLI                (pending)
packages/admin-ui/    # Astro + Solid islands        (pending)
packages/docs-site/   # Astro + Starlight            (pending)
```

## ADRs

See `vault://18_decisions/`. Latest:
- ADR-017 — OpenCode mechanism wholesale
- ADR-018 — Astro as frontend convention (Bun/Elysia stack)
- ADR-019 — Queue: Bun-native Redis Streams + embedded workers + idempotent consumers
