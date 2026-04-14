import type { SlashRegistry } from "./registry.ts"
import { definitionFromMarkdown } from "./registry.ts"
import type { SlashDefinition } from "./types.ts"

const ARCHITECT_BODY = `---
description: Produce design doc + ADR draft for the given scope
agents: [pm, architect, reviewer]
tools: [Read, Grep]
isolation: worktree
timeout_minutes: 30
args:
  - name: scope
    type: string
    required: true
  - name: risk
    type: string
    default: medium
---
You are invoked as /architect. Produce a design doc for scope "{{args.scope}}" with risk class "{{args.risk}}".

Steps:
1. Load context (repo discovery + prior ADRs).
2. Draft design with trade-offs + alternatives.
3. Flag risks for security review.
4. Emit ADR draft.`

const TDD_BODY = `---
description: Write failing test, implement, refactor (RED-GREEN-REFACTOR)
agents: [qa, backend]
tools: [Read, Write, Bash, Grep]
isolation: worktree
timeout_minutes: 45
args:
  - name: scope
    type: string
    required: true
  - name: min_coverage
    type: number
    default: 80
---
You are invoked as /tdd. Apply TDD on scope "{{args.scope}}" with min coverage {{args.min_coverage}}%.

Cycle:
1. RED: write failing test that captures intent
2. GREEN: minimal code to pass
3. REFACTOR: improve while staying green
Repeat until scope covered.`

const CODE_REVIEW_BODY = `---
description: Severity-ranked code review of current changes
agents: [reviewer, security]
tools: [Read, Grep, Bash]
isolation: none
timeout_minutes: 20
args:
  - name: target
    type: string
    default: HEAD
---
You are invoked as /code-review. Review changes in "{{args.target}}".

Output sections:
- 🔴 Critical (blockers)
- 🟠 Major
- 🟡 Minor
- 💡 Suggestions
Include file:line pointers and suggested fixes.`

const PLAN_BODY = `---
description: Turn a goal into a short execution plan
agents: [coordinator, architect]
tools: [Read, Grep]
isolation: worktree
timeout_minutes: 15
args:
  - name: goal
    type: string
    required: true
---
You are invoked as /plan. Turn "{{args.goal}}" into a small execution plan with ordered steps.

Return:
- Goal
- Steps
- Risks
- Suggested validation`

const SECURITY_REVIEW_BODY = `---
description: Threat model + vulnerability scan of given scope
agents: [security, architect, reviewer]
tools: [Read, Grep]
isolation: worktree
timeout_minutes: 40
args:
  - name: scope
    type: string
    required: true
---
You are invoked as /security-review on scope "{{args.scope}}".

Produce:
- Threat model (STRIDE or similar)
- Vulnerabilities found (OWASP-aligned)
- Remediation proposals
- Risk score per finding`

const DOC_BODY = `---
description: Explain the command and its next action
agents: [coordinator]
tools: [Read]
isolation: none
timeout_minutes: 10
args:
  - name: target
    type: string
    default: current
---
You are invoked as /{{name}}. Explain the next action for "{{args.target}}" and keep the answer concise.`

const CHECKPOINT_BODY = `---
description: Create a checkpoint and report the recovery reference
agents: [coordinator, reviewer]
tools: [Read, Bash, Git]
isolation: worktree
timeout_minutes: 20
args:
  - name: name
    type: string
    default: auto
---
You are invoked as /checkpoint. Create a checkpoint named "{{args.name}}" and report how to restore it.`

const REWIND_BODY = `---
description: Restore the last safe checkpoint
agents: [coordinator, reviewer]
tools: [Read, Bash, Git]
isolation: worktree
timeout_minutes: 20
args:
  - name: checkpoint
    type: string
    required: true
---
You are invoked as /rewind. Restore checkpoint "{{args.checkpoint}}" and summarize the rollback.`

const TASKS_BODY = `---
description: Show the current task list and next action
agents: [coordinator]
tools: [Read]
isolation: none
timeout_minutes: 10
args: []
---
You are invoked as /tasks. Summarize the active tasks, highlight blockers, and name the next action.`

const CLEAR_BODY = `---
description: Clear the current working context and state
agents: [coordinator]
tools: [Read]
isolation: none
timeout_minutes: 5
args: []
---
You are invoked as /clear. Clear the current conversational context and confirm readiness for the next task.`

const HELP_BODY = `---
description: List available slash commands
agents: [coordinator]
tools: [Read]
isolation: none
timeout_minutes: 5
args: []
---
You are invoked as /help. List the available slash commands and what each one is for.`

const CONSENSUS_BODY = `---
description: Cross-CLI fan-out and winner selection for a prompt
agents: [coordinator, reviewer, architect]
tools: [Read, Bash]
isolation: worktree
timeout_minutes: 30
args:
  - name: prompt
    type: string
    required: true
  - name: cli
    type: string
    default: claude,codex,gemini
---
You are invoked as /consensus. Fan out the prompt "{{args.prompt}}" across the available CLI bridges and pick the best response.
If "{{args.cli}}" is provided, restrict the fan-out to that CLI subset.

Return:
- Winner CLI
- Winner text
- Score table
- Short rationale for the decision`

export const BUILTIN_COMMAND_SOURCES: Record<string, string> = {
  architect: ARCHITECT_BODY,
  checkpoint: CHECKPOINT_BODY,
  consensus: CONSENSUS_BODY,
  clear: CLEAR_BODY,
  tdd: TDD_BODY,
  "code-review": CODE_REVIEW_BODY,
  doctor: DOC_BODY,
  help: HELP_BODY,
  init: DOC_BODY,
  plan: PLAN_BODY,
  rewind: REWIND_BODY,
  tasks: TASKS_BODY,
  "security-review": SECURITY_REVIEW_BODY,
}

export function builtinDefinitions(): SlashDefinition[] {
  return Object.entries(BUILTIN_COMMAND_SOURCES).map(([name, source]) =>
    definitionFromMarkdown(name, source, `builtin:${name}`),
  )
}

export function registerBuiltinCommands(registry: SlashRegistry): void {
  for (const def of builtinDefinitions()) registry.register(def)
}
