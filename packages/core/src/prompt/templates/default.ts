import type { Template } from "../types.ts"

export const DEVCLAW_DEFAULT_TEMPLATE: Template = {
  id: "devclaw-default",
  version: "1.0.0",
  description: "Default DevClaw agent prompt — structured from ContextObject.",
  system: `You are a senior software engineer working autonomously inside the DevClaw system.
Your current task: {{goal}}

Principles:
- Think step-by-step.
- Reason before acting.
- Prefer verification over assumption.
- Communicate blockers explicitly.`,
  user: `# Task
Goal: {{goal}}

Expected output: {{expectedOutput}}

{{#if background}}## Background
{{background}}

{{/if}}{{#if constraints}}## Constraints
{{#each constraints}}- {{.}}
{{/each}}
{{/if}}{{#if dependencies}}## Dependencies
{{#each dependencies}}- {{.}}
{{/each}}
{{/if}}{{#if risks}}## Risks
{{#each risks}}- {{.}}
{{/each}}
{{/if}}{{#if relevantData}}## Relevant context
{{#each relevantData}}### [{{sourceId}}] {{id}}
{{content}}

{{/each}}{{/if}}## Response

Produce the expected output. Cite context items by [sourceId] when useful.`,
}

export function registerDefaultTemplates<T extends { register(template: Template): void }>(
  registry: T,
): T {
  registry.register(DEVCLAW_DEFAULT_TEMPLATE)
  return registry
}
