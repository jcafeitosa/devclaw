import type { RoleDefinition, RoleId } from "./types.ts"

export const ROLE_CATALOG: Record<RoleId, RoleDefinition> = {
  pm: {
    id: "pm",
    name: "Product Manager",
    description: "Translate ideas into PRDs, OKRs, acceptance criteria",
    cliPreference: ["claude", "codex"],
    skills: ["requirements", "prioritization", "stakeholder"],
    budgetShare: 0.1,
    tier: "advisor",
  },
  architect: {
    id: "architect",
    name: "Architect",
    description: "Design docs, ADRs, system architecture",
    cliPreference: ["claude"],
    skills: ["system-design", "trade-off-analysis", "scaling"],
    budgetShare: 0.15,
    tier: "advisor",
  },
  coordinator: {
    id: "coordinator",
    name: "Coordinator",
    description: "Break design into tasks, assign owners, track progress",
    cliPreference: ["claude"],
    skills: ["decomposition", "dependency-analysis"],
    budgetShare: 0.05,
    tier: "executor",
  },
  backend: {
    id: "backend",
    name: "Backend Engineer",
    description: "Server-side implementation, APIs, DB",
    cliPreference: ["claude", "aider"],
    skills: ["typescript", "rust", "go", "postgres"],
    budgetShare: 0.2,
    tier: "executor",
  },
  frontend: {
    id: "frontend",
    name: "Frontend Engineer",
    description: "UI implementation, UX polish",
    cliPreference: ["codex", "claude"],
    skills: ["astro", "solid", "react", "css", "a11y"],
    budgetShare: 0.15,
    tier: "executor",
  },
  data: {
    id: "data",
    name: "Data Engineer",
    description: "Schema design, migrations, pipelines, analytics",
    cliPreference: ["claude"],
    skills: ["sql", "etl", "pgvector", "timeseries"],
    budgetShare: 0.08,
    tier: "executor",
  },
  qa: {
    id: "qa",
    name: "QA Engineer",
    description: "Test strategy, test generation, validation",
    cliPreference: ["claude"],
    skills: ["testing", "edge-cases", "quality-gates"],
    budgetShare: 0.07,
    tier: "executor",
  },
  sre: {
    id: "sre",
    name: "SRE",
    description: "Deploy, monitor, incidents, performance",
    cliPreference: ["claude"],
    skills: ["infra", "observability", "automation"],
    budgetShare: 0.05,
    tier: "executor",
  },
  security: {
    id: "security",
    name: "Security",
    description: "Threat modeling, vulnerability scanning, compliance",
    cliPreference: ["claude"],
    skills: ["owasp", "threat-modeling", "secure-coding"],
    budgetShare: 0.05,
    tier: "advisor",
  },
  doc: {
    id: "doc",
    name: "Documentation",
    description: "Keep docs in sync with code, write tutorials",
    cliPreference: ["claude"],
    skills: ["technical-writing", "examples"],
    budgetShare: 0.03,
    tier: "executor",
  },
  research: {
    id: "research",
    name: "Research",
    description: "Research tech, libs, best practices, state of art",
    cliPreference: ["gemini", "claude"],
    skills: ["web-search", "paper-reading", "comparison"],
    budgetShare: 0.04,
    tier: "advisor",
  },
  reviewer: {
    id: "reviewer",
    name: "Reviewer",
    description: "Code review, doc review, decision review",
    cliPreference: ["claude"],
    skills: ["critical-thinking", "standards"],
    budgetShare: 0.02,
    tier: "advisor",
  },
  learning: {
    id: "learning",
    name: "Learning",
    description: "Extract patterns, evolve skills/policies",
    cliPreference: ["claude"],
    skills: ["pattern-recognition", "abstraction"],
    budgetShare: 0.01,
    tier: "advisor",
  },
}

export function getRole(id: RoleId): RoleDefinition {
  const def = ROLE_CATALOG[id]
  if (!def) throw new Error(`team: unknown role '${id}'`)
  return def
}

export function listRoles(): RoleDefinition[] {
  return Object.values(ROLE_CATALOG)
}
