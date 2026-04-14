import type { Interaction, RoleId, Team } from "./types.ts"

export type PatternId =
  | "waterfall"
  | "generator-verifier"
  | "pair"
  | "council"
  | "mentor"
  | "consult"

export interface PatternRunContext {
  team: Team
  topic: string
  riskClass?: "low" | "medium" | "high" | "critical"
}

export interface PatternResult {
  pattern: PatternId
  interactions: Interaction[]
  primary: RoleId
  reviewers: RoleId[]
  advisors: RoleId[]
}

function has(team: Team, role: RoleId): boolean {
  return team.members.some((m) => m.role === role)
}

function pickFirst(team: Team, candidates: RoleId[], fallback: RoleId): RoleId {
  for (const role of candidates) {
    if (has(team, role)) return role
  }
  return fallback
}

function mk(
  mode: Interaction["mode"],
  from: RoleId,
  to: RoleId | RoleId[],
  topic: string,
): Interaction {
  return { mode, from, to, topic, at: Date.now() }
}

export function runPattern(id: PatternId, ctx: PatternRunContext): PatternResult {
  switch (id) {
    case "waterfall":
      return waterfall(ctx)
    case "generator-verifier":
      return generatorVerifier(ctx)
    case "pair":
      return pair(ctx)
    case "council":
      return council(ctx)
    case "mentor":
      return mentor(ctx)
    case "consult":
      return consult(ctx)
    default: {
      const _never: never = id
      throw new Error(`team: unknown pattern '${_never as string}'`)
    }
  }
}

function waterfall(ctx: PatternRunContext): PatternResult {
  const team = ctx.team
  const interactions: Interaction[] = []
  const steps: Array<[RoleId, RoleId]> = []
  if (has(team, "pm") && has(team, "architect")) steps.push(["pm", "architect"])
  if (has(team, "architect") && has(team, "coordinator")) steps.push(["architect", "coordinator"])
  const coordinator = has(team, "coordinator") ? "coordinator" : "pm"
  const workers = (["backend", "frontend", "data"] as RoleId[]).filter((r) => has(team, r))
  for (const w of workers) steps.push([coordinator, w])
  for (const [from, to] of steps) interactions.push(mk("delegate", from, to, ctx.topic))
  const reviewers = (["qa", "security"] as RoleId[]).filter((r) => has(team, r))
  for (const rev of reviewers) {
    interactions.push(mk("collab", rev, workers, `review: ${ctx.topic}`))
  }
  return {
    pattern: "waterfall",
    interactions,
    primary: coordinator,
    reviewers,
    advisors: (["architect", "pm"] as RoleId[]).filter((r) => has(team, r)),
  }
}

function generatorVerifier(ctx: PatternRunContext): PatternResult {
  const generator = pickFirst(ctx.team, ["backend", "frontend", "data"], "coordinator")
  const verifier = pickFirst(ctx.team, ["reviewer", "qa", "security"], "architect")
  return {
    pattern: "generator-verifier",
    primary: generator,
    reviewers: [verifier],
    advisors: [],
    interactions: [
      mk("delegate", "coordinator", generator, ctx.topic),
      mk("collab", generator, verifier, `review: ${ctx.topic}`),
      mk("debate", verifier, generator, `adjudicate: ${ctx.topic}`),
    ],
  }
}

function pair(ctx: PatternRunContext): PatternResult {
  const team = ctx.team
  const candidates = (["backend", "frontend", "data", "qa"] as RoleId[]).filter((r) => has(team, r))
  const a = candidates[0] ?? "coordinator"
  const b = candidates[1] ?? candidates[0] ?? "reviewer"
  return {
    pattern: "pair",
    primary: a,
    reviewers: [b],
    advisors: [],
    interactions: [mk("collab", a, b, ctx.topic), mk("collab", b, a, `compare: ${ctx.topic}`)],
  }
}

function council(ctx: PatternRunContext): PatternResult {
  const team = ctx.team
  const convened = (["architect", "security", "sre", "backend"] as RoleId[]).filter((r) =>
    has(team, r),
  )
  const primary = convened[0] ?? "coordinator"
  return {
    pattern: "council",
    primary,
    reviewers: [],
    advisors: convened.slice(1),
    interactions: convened.map((r) => mk("debate", r, convened, ctx.topic)),
  }
}

function mentor(ctx: PatternRunContext): PatternResult {
  const advisor = pickFirst(ctx.team, ["architect", "reviewer", "pm"], "coordinator")
  const worker = pickFirst(ctx.team, ["backend", "frontend", "data"], "coordinator")
  return {
    pattern: "mentor",
    primary: worker,
    reviewers: [],
    advisors: [advisor],
    interactions: [
      mk("collab", advisor, worker, `mentor: ${ctx.topic}`),
      mk("collab", worker, advisor, `apply: ${ctx.topic}`),
    ],
  }
}

function consult(ctx: PatternRunContext): PatternResult {
  const worker = pickFirst(ctx.team, ["backend", "frontend", "data"], "coordinator")
  const specialist = pickFirst(ctx.team, ["security", "sre", "architect"], "reviewer")
  return {
    pattern: "consult",
    primary: worker,
    reviewers: [],
    advisors: [specialist],
    interactions: [
      mk("collab", worker, specialist, `consult: ${ctx.topic}`),
      mk("collab", specialist, worker, `recommend: ${ctx.topic}`),
    ],
  }
}
