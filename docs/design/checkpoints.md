# Design: Checkpoints & Rewind

> Vault: `47_checkpoints_rewind/`. Phase 2.

## 🎯 Goal

Git-stash based snapshots (automático antes de ops destrutivas, manual via API) + chat rewind (archive mensagens após id). Retention policy + verificação.

## 🧩 Componentes

1. Types + errors (Checkpoint, CheckpointRef, CheckpointTrigger, RewindSnapshot).
2. `CheckpointStore` (interface + InMemory + JSON-file index): `create`, `get`, `list`, `delete`, `prune(retention)`.
3. `CheckpointCreator`: injectable `git` runner; `createFromWorkspace(name, trigger)` → `git add -A` + `git stash create` + `update-ref refs/checkpoints/<name>` + persist to store.
4. `CheckpointRestorer`: `restore(id)` → `git stash apply <sha>` (or `--index`); rejects when store missing ref.
5. `ChatRewind`: in-memory conversation log with `append`, `rewindAfter(messageId)` → archive; `restore(archiveId)`; search by id.
6. `CheckpointManager` glues creator + restorer + chat rewind + retention policy (last 50 hot, 50-200 cold, >200 clear).
7. Barrel + `@devclaw/core/checkpoint` subpath.

## 🔒 Invariants

- Rewind nunca deleta mensagens (archive only)
- Checkpoint store é fonte de verdade para refs (git é armazenamento físico)
- Retention conserva `pinned` indefinidamente
- Git wrapper injectable (tests sem repo real)
- Unknown id → `CheckpointNotFoundError`

## 📋 Plan (6 tasks)

| # | Task |
|---|---|
| 1 | Types + errors |
| 2 | CheckpointStore (InMemory + retention) |
| 3 | CheckpointCreator (git injection) |
| 4 | CheckpointRestorer + verify |
| 5 | ChatRewind (archive/restore) |
| 6 | Manager + barrel |

## ✅ DoD

- 0 skip/fail/info/suppressions
- Retention test covers hot/cold/purge boundaries
- Rewind test preserves archive for restore
