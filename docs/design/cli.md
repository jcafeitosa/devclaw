# Design: `devclaw` CLI

> Packages `packages/cli/`. Binário que amarra `@devclaw/core`.

## 🎯 Goal

`devclaw` CLI com subcomandos — ponto de entrada user-facing. Zero deps (args parser + color próprios).

## 🧩 Comandos

| Comando | Descrição |
|---|---|
| `devclaw version` | Print version |
| `devclaw help [cmd]` | Help (geral ou específico) |
| `devclaw init [dir]` | Cria `devclaw.json` + `.devclaw/` no dir |
| `devclaw discover [dir]` | Roda `discover()` e printa report |
| `devclaw auth list` | Lista credenciais armazenadas (sem valores) |
| `devclaw login <provider> --key <k>` | Grava API key |
| `devclaw logout <provider>` | Remove credencial |
| `devclaw providers` | Lista providers + capabilities + availability |
| `devclaw bridges` | Lista CLI bridges + availability |
| `devclaw invoke --prompt "..." [--cli claude] [--provider openai]` | Executa prompt via bridge+fallback |

## 🧩 Componentes

1. Arg parser: subcommand + typed flags (string/bool/number + `--k v` e `--k=v`)
2. Command registry: `{name, describe, handler, flags}`; gera help automático
3. Color util: ANSI codes (sem chalk); auto-disable se stdout !tty
4. `createRuntime()` factory: instancia AuthStore + Discovery + ProviderCatalog + BridgeRegistry + FallbackStrategy
5. Entry point `src/index.ts`: parse → dispatch → error handling (exit 1 on caught error com mensagem)
6. `bin` em `package.json`: `devclaw → src/index.ts`

## 🔒 Invariants

- Exit code 0 em success, 1 em erro operacional, 2 em usage error
- Nunca imprime auth tokens
- Todas ops de filesystem confinadas a `.devclaw/` ou `cwd`
- `--json` flag global troca output para JSON machine-readable

## 📋 Plan (7 tasks)

| # | Task |
|---|---|
| 1 | CLI scaffold + arg parser + command registry + tests |
| 2 | Color util + help formatting + tests |
| 3 | `version` + `discover` commands + tests |
| 4 | Runtime factory + `auth list` / `login` / `logout` commands |
| 5 | `providers` + `bridges` + `init` commands |
| 6 | `invoke` command (end-to-end w/ FallbackStrategy) |
| 7 | Entry point + bin + package wiring + smoke test |

## ✅ DoD

- Zero skip/fail/info/suppressions
- `bun devclaw version` roda via workspace
- Commands testados unit-level (handlers isolados) + 1 integration smoke
