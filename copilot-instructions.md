# Copilot Instructions — Devclaw

Objetivo

Breve guia mínimo para agentes (Copilot/CLI sub-agents) ao trabalhar neste repositório.

Leitura obrigatória (sempre antes de começar qualquer trabalho)

- CLAUDE.md — /Users/jcafeitosa/Develop/Devclaw/CLAUDE.md
- README.md — /Users/jcafeitosa/Develop/Devclaw/README.md
- TODO.md — /Users/jcafeitosa/Develop/Devclaw/docs/TODO.md

Antes de qualquer implementação, leia integralmente esses três arquivos. Eles contêm as políticas (SDD+TDD), gates, e o fluxo de claim/lock para tarefas.

Principais regras (resumo)

- SDD + TDD obrigatórios: espec → plano curto → escrever teste falhando (RED) → implementar mínimo (GREEN) → refatorar (REFACTOR).
- Sem código de produção antes do teste falhar. Sem skips (`.skip`, `.only`) ou ignoros de linter sem justificativa.
- Tolerância zero para `error`, `warn`, `TODO`, `FIXME`, código incompleto, gambiarra, workaround, atalhos temporários e similares.
- Use APIs "Bun-first" sempre que possível (Bun.file, Bun.$, Bun.password, bun:sqlite, etc.).
- Não commitar segredos — use variáveis de ambiente / secret manager. Se encontrar segredo em repo, não publicar; rotacione e purgue histórico.

Gate (zero-tolerance)

Antes de declarar uma tarefa completa ou abrir PR para merge na main:

- `bun test` — 0 falhas (todos os pacotes)
- `bun run lint` — 0 erros, 0 warnings (biome). O CI aplica fail-on-warnings.
- `bun run typecheck` — zero diagnósticos
- `bun run format` — sem diffs após rodar (o CI executa o format e falha se produzir mudanças)
- Nenhum comentário `TODO` / `FIXME` sem referência a uma issue/tarefa — o CI irá falhar se encontrar.

Enforcement notes:

- Um workflow de GitHub Actions (`.github/workflows/ci.yml`) aplica essas checagens em push e PRs; falhas quebram o pipeline.
- Agentes devem rodar os mesmos checks localmente antes de commitar.
- Se o CI falhar por alguma dessas regras, corrija localmente (ou abra PRs pequenas para remover/bloquear TODOs com issue link) e reenvie.

Comandos rápidos

- Instalar deps: `bun install`
- Testes: `bun test`
- Typecheck: `bun typecheck`
- Lint: `bun lint` / `bun lint:fix`
- Format: `bun format`
- Redis integration tests: `BUN_TEST_REDIS=redis://localhost:6379 bun test`

Fluxo de tarefas (docs/TODO.md)

1. `git pull --rebase` para garantir que o TODO não foi reclamado.
2. Localizar primeiro item ⬜ (pendente) em `docs/TODO.md` (top = maior prioridade).
3. Claim: alterar a linha do TODO de `⬜` → `🔒 claimed by <agent-id> <timestamp>` e criar lock local:

   ```bash
   echo "<agent-id> $(date -u +%Y-%m-%dT%H:%M:%SZ)" > .devclaw/locks/<task-id>.lock
   git add docs/TODO.md && git commit -m "chore: claim <task-id>"
   git switch -c feat/<task-id>-<short-desc>
   ```

4. Implementar seguindo SDD+TDD (commitar RED e GREEN separadamente).
5. Verificar gates (tests, lint, types, format).
6. Marcar `docs/TODO.md` como `✅ (YYYY-MM-DD, nota)` e remover lock local.

Commit, branch e PR

- Branch naming: `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`.
- Commits: Conventional Commits. Faça um commit por ciclo RED→GREEN.
- Trailer obrigatório em commits automáticos: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` (adicionar como trailer quando o agente criar commits).
- Abra PR para `main` usando `gh pr create` ou pela interface. Inclua descrição curta, testes executados e referência ao TODO.

Observabilidade e segurança

- Evite `console.log` em paths de produção — use o módulo de observability.
- Nunca adicione `// @ts-ignore` / `// biome-ignore` sem justificativa numa linha.
- Se encontrar tokens/credenciais em arquivos de exemplo (ex.: CLAUDE.md contém um exemplo de bearer token), rotacione e substitua por placeholder e instrua o responsável a purgar histórico se necessário.

Como agentes devem comunicar-se

- Sempre registre decisões e debates publicamente (não trabalhar em silêncio).
- Use o arquivo `packages/core/src/skill/builtins/agents/` para carregamento de prompts de papel (role prompts).
- Ao coordenar multidepartment (PM/Eng/SRE/QA/etc.), emule diálogo explícito (estilo Slack): sinalize emissão e destinatário, ações, responsáveis e prazos.

Finalização de tarefa

- Só chamar `task_complete` (ou marcar ✅ em TODO e abrir PR) quando: todos os testes passam localmente, gates satisfeitos, e PR está pronto para revisão.
- Inclua no PR os commits RED e GREEN (separados) quando possível.

Referências

- CLAUDE.md (políticas + ADRs)
- README.md (quick start, arquitetura)
- docs/TODO.md (prioridades + claiming protocol)

Se precisar de um template de PR, script de claim automático, ou simulação de coordenação entre agentes (Slack-style), solicitar explicitamente para que eu gere os artefatos e exemplos.
