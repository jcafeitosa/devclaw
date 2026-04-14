import type { ContextObject } from "../context/types.ts"
import type { TemplateRegistry } from "./registry.ts"
import { render } from "./renderer.ts"
import type { PromptMessage, RenderContext, RenderedPrompt } from "./types.ts"

export interface PromptBuilderConfig {
  registry: TemplateRegistry
  defaultTemplateId: string
  defaultTemplateVersion?: string
}

export interface BuildOpts {
  templateId?: string
  templateVersion?: string
  variables?: RenderContext
}

function toContextVars(ctx: ContextObject): RenderContext {
  return {
    goal: ctx.goal,
    expectedOutput: ctx.expectedOutput,
    background: ctx.background,
    constraints: ctx.constraints,
    dependencies: ctx.dependencies,
    risks: ctx.risks,
    relevantData: ctx.relevantData,
  }
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export class PromptBuilder {
  constructor(private readonly cfg: PromptBuilderConfig) {}

  build(ctx: ContextObject, opts: BuildOpts = {}): RenderedPrompt {
    const id = opts.templateId ?? this.cfg.defaultTemplateId
    const version = opts.templateVersion ?? this.cfg.defaultTemplateVersion
    const template = this.cfg.registry.get(id, version)
    const vars: RenderContext = { ...toContextVars(ctx), ...(opts.variables ?? {}) }
    const system = template.system ? render(template.system, vars) : undefined
    const user = render(template.user, vars)
    const messages: PromptMessage[] = [{ role: "user", content: user }]
    const cacheSeed = `${template.id}@${template.version}\n${system ?? ""}\n${user}`
    const cacheKey = hashSync(cacheSeed)
    return {
      templateId: template.id,
      templateVersion: template.version,
      system,
      messages,
      cacheKey,
    }
  }
}

function hashSync(text: string): string {
  const bytes = new TextEncoder().encode(text)
  // FNV-1a 64-bit variant — deterministic, sync, sufficient for cache key
  let hash = 0xcbf29ce484222325n
  for (let i = 0; i < bytes.length; i++) {
    hash ^= BigInt(bytes[i] ?? 0)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, "0")
}

// Export async SHA-256 alternative for callers that prefer cryptographic hashes
export { sha256 as computePromptHashAsync }
