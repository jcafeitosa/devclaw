import { parseFrontmatterMarkdown } from "../slash/frontmatter.ts"
import { SkillParseError } from "./errors.ts"
import type { Skill, SkillInputSpec, SkillStatus } from "./types.ts"

const VALID_STATUS = new Set<SkillStatus>(["draft", "review", "active", "deprecated", "archived"])

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === "string")
}

function asInputSpecs(v: unknown): SkillInputSpec[] {
  if (!Array.isArray(v)) return []
  const out: SkillInputSpec[] = []
  for (const entry of v) {
    if (!entry || typeof entry !== "object") continue
    const rec = entry as Record<string, unknown>
    const name = typeof rec.name === "string" ? rec.name : undefined
    const type =
      rec.type === "string" ||
      rec.type === "number" ||
      rec.type === "boolean" ||
      rec.type === "object" ||
      rec.type === "array"
        ? rec.type
        : undefined
    if (!name || !type) continue
    const spec: SkillInputSpec = { name, type }
    if (rec.required === true) spec.required = true
    if (typeof rec.describe === "string") spec.describe = rec.describe
    out.push(spec)
  }
  return out
}

export function parseSkillMarkdown(fallbackName: string, text: string, source?: string): Skill {
  const { frontmatter, body } = parseFrontmatterMarkdown(text)
  const id = typeof frontmatter.name === "string" ? frontmatter.name : fallbackName
  const version = typeof frontmatter.version === "string" ? frontmatter.version : "1.0.0"
  const rawStatus = typeof frontmatter.status === "string" ? frontmatter.status : "draft"
  const status = VALID_STATUS.has(rawStatus as SkillStatus) ? (rawStatus as SkillStatus) : "draft"
  const description = typeof frontmatter.description === "string" ? frontmatter.description : ""
  if (!id) throw new SkillParseError(fallbackName, new Error("skill missing id"))
  const constraints = frontmatter.constraints
  const constraintsObj =
    constraints && typeof constraints === "object" ? (constraints as Record<string, unknown>) : {}

  return {
    id,
    version,
    status,
    description,
    body,
    tags: asStringArray(frontmatter.tags),
    triggers: asStringArray(frontmatter.triggers),
    inputs: asInputSpecs(frontmatter.inputs),
    steps: asStringArray(frontmatter.steps),
    contextRequirements: asStringArray(frontmatter.context_requirements),
    tools: asStringArray(frontmatter.tools),
    constraints: {
      maxValueUsd:
        typeof constraintsObj.max_value_usd === "number" ? constraintsObj.max_value_usd : undefined,
      requiresApproval: constraintsObj.requires_approval === true ? true : undefined,
      maxDurationMs:
        typeof constraintsObj.max_duration_ms === "number"
          ? constraintsObj.max_duration_ms
          : undefined,
      tools: asStringArray(constraintsObj.tools),
    },
    outputSchema:
      frontmatter.output_schema && typeof frontmatter.output_schema === "object"
        ? (frontmatter.output_schema as Record<string, unknown>)
        : undefined,
    author: typeof frontmatter.author === "string" ? frontmatter.author : undefined,
    source,
    updatedAt: Date.now(),
  }
}
