---
title: DevClaw
description: Autonomous software development team for solo developers.
---

**DevClaw** is a Bun-native autonomous software development team built around
multi-agent collaboration, self-correction, learning, and governance.

## Stack

- **Runtime:** Bun 1.3+ (native HTTP, test runner, SQL, Redis, S3)
- **Backend:** Elysia 1.4+ with end-to-end types via Eden
- **Frontend:** Astro 6.x (islands, zero JS by default) + Solid
- **Tooling:** Biome 2.4, Turborepo 2.9, TypeScript 6

## Philosophy

1. **Bun-native first.** Avoid deps where a built-in exists.
2. **Zero tolerance.** No warnings, no skipped tests, no suppressions.
3. **SDD + TDD.** Spec-driven design, test-driven execution.
4. **Spec source-of-truth lives in an Obsidian vault** — this site is a
   navigable surface over the implementation.

Jump to [Architecture](/guides/architecture/), [Agent liveness](/guides/agent-liveness/),
or [Vault alignment](/guides/vault-alignment/) for the full model, or the
[package reference](/reference/packages/).
