import type { ProviderCatalog } from "../provider/catalog.ts"
import { PlanParseError } from "./errors.ts"
import type { Plan, Step, Task } from "./types.ts"

export interface Planner {
  plan(task: Task): Promise<Plan>
}

const FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/

function stripFence(text: string): string {
  const trimmed = text.trim()
  const match = trimmed.match(FENCE_RE)
  return match ? (match[1] ?? "") : trimmed
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter((x): x is string => typeof x === "string")
}

export function parsePlanFromJson(goal: string, raw: string): Plan {
  let data: unknown
  try {
    data = JSON.parse(stripFence(raw))
  } catch (cause) {
    throw new PlanParseError(raw, cause)
  }
  if (!data || typeof data !== "object") {
    throw new PlanParseError(raw, new Error("expected object"))
  }
  const steps = (data as { steps?: unknown }).steps
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new PlanParseError(raw, new Error("missing or empty steps[]"))
  }
  const out: Step[] = []
  for (const entry of steps) {
    if (!entry || typeof entry !== "object") {
      throw new PlanParseError(raw, new Error("step not object"))
    }
    const s = entry as Record<string, unknown>
    const id = typeof s.id === "string" ? s.id : ""
    const description = typeof s.description === "string" ? s.description : ""
    if (!id || !description) {
      throw new PlanParseError(raw, new Error(`step missing id/description: ${JSON.stringify(s)}`))
    }
    out.push({
      id,
      description,
      tier:
        s.tier === "executor" || s.tier === "advisor" || s.tier === "fallback" ? s.tier : undefined,
      priority: typeof s.priority === "number" ? s.priority : undefined,
      dependsOn: asStringArray(s.dependsOn),
      tool: typeof s.tool === "string" ? s.tool : undefined,
      toolInput: s.toolInput,
      expectedOutput: typeof s.expectedOutput === "string" ? s.expectedOutput : undefined,
    })
  }
  return { goal, steps: out, createdAt: Date.now() }
}

export class StubPlanner implements Planner {
  constructor(private readonly steps: Step[]) {}
  async plan(task: Task): Promise<Plan> {
    return { goal: task.goal, steps: [...this.steps], createdAt: Date.now() }
  }
}

export interface LLMPlannerConfig {
  catalog: ProviderCatalog
  providerId: string
  model?: string
  systemPrompt?: string
  maxTokens?: number
}

const DEFAULT_SYSTEM = `You are the planner inside an autonomous software agent.
Break the goal into small, verifiable, independently executable steps.
Return STRICT JSON only, no prose. Schema:
{"steps":[{"id":"s1","description":"...","dependsOn":["s0"],"priority":1,"expectedOutput":"..."}]}
- Use short kebab-case ids. Include dependsOn only when a step actually needs a prior one.`

export class LLMPlanner implements Planner {
  constructor(private readonly cfg: LLMPlannerConfig) {}

  async plan(task: Task): Promise<Plan> {
    const system = this.cfg.systemPrompt ?? DEFAULT_SYSTEM
    const prompt = `Goal: ${task.goal}\n\nExpected output: ${task.expectedOutput}${
      task.hints && task.hints.length > 0 ? `\n\nHints:\n- ${task.hints.join("\n- ")}` : ""
    }\n\nProduce the JSON plan now.`
    const raw = await this.cfg.catalog.generate(this.cfg.providerId, {
      prompt,
      system,
      model: this.cfg.model,
      maxTokens: this.cfg.maxTokens ?? 2048,
    })
    return parsePlanFromJson(task.goal, raw)
  }
}
