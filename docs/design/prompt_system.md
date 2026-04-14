# Design: Prompt System

> Full-spec per `vault://06_agent_os/prompt_system` + ADR-002.

## 🎯 Goal

Transformar `ContextObject` (output do Context Engine) em prompt concreto por provider, com templates versionados, substituição de variáveis, validação, e cache key para prefix caching.

## 🧩 Componentes

1. **Types**: `Template{id,version,system,user,variables}`, `RenderContext`, `PromptMessage{role,content}`, `RenderedPrompt{system,messages,cacheKey}`; erros (`TemplateNotFound`, `RenderError`, `MissingVariableError`).
2. **Renderer** (Mustache-style `{{var}}`, suporta `{{#if}}…{{/if}}` e `{{#each}}…{{/each}}`): strict — lança se variável ausente a menos que `{{var?}}` opcional.
3. **TemplateRegistry**: `register/get(id, version?)/list`; versioning por semver; retorna latest se version omitida.
4. **ProviderPromptAdapter**: transforma `RenderedPrompt` em shape provider-específico.
   - `AnthropicPromptAdapter`: `{system: string, messages: Array<{role: "user"|"assistant", content}>}`
   - `OpenAIPromptAdapter`: `{messages: Array<{role: "system"|"user"|"assistant", content}>}`
5. **PromptBuilder**: recebe `ContextObject` + template id + variables extras → chama render → retorna `RenderedPrompt` com `cacheKey` determinístico (SHA-256 do prompt final).
6. **DefaultTemplate**: template devclaw padrão que consome `ContextObject` (goal/expectedOutput/constraints/dependencies/risks/relevantData).

## 🔒 Invariants

- Variáveis ausentes (não-opcionais) → `MissingVariableError`
- Template não registrado → `TemplateNotFound`
- `cacheKey` determinístico (mesmo input → mesmo hash)
- Renderer nunca executa código (strings only)
- Provider adapters nunca mutam o `RenderedPrompt` original

## 📋 Plan (6 tasks)

| # | Task | Files |
|---|---|---|
| 1 | types + errors | `src/prompt/types.ts` + `errors.ts` + tests |
| 2 | Mustache renderer (if/each + strict + optional) | `src/prompt/renderer.ts` + test |
| 3 | TemplateRegistry (versioning + list) | `src/prompt/registry.ts` + test |
| 4 | Anthropic + OpenAI prompt adapters | `src/prompt/adapters/{anthropic,openai}.ts` + tests |
| 5 | PromptBuilder (ContextObject → RenderedPrompt + cacheKey) | `src/prompt/builder.ts` + test |
| 6 | Default devclaw template + barrel | `src/prompt/templates/default.ts` + `index.ts` + test |

## ✅ DoD

- 6 tasks green; 0 skip/fail/info/suppressions
- Renderer cobre strings, if, each, optional, missing-throws
- Adapter tests assertam message shape exato por provider
- Builder integra com `ContextObject` de CE real (end-to-end)
