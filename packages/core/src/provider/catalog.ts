import type { KernelContext, SafetyKernel } from "../kernel/index.ts"

export interface GenerateOpts {
  prompt: string
  model?: string
  maxTokens?: number
  temperature?: number
  system?: string
  /**
   * When true, adapters that support prompt caching mark the system prompt
   * as cacheable (Anthropic: `cache_control: { type: "ephemeral" }`).
   * OpenAI caches automatically; this flag is a no-op there.
   */
  cacheSystem?: boolean
}

export interface UsageMetrics {
  input_tokens: number
  output_tokens: number
  /** Anthropic: tokens read from prompt cache (~10% of input rate). */
  cache_read_input_tokens?: number
  /** Anthropic: tokens written to prompt cache (~125% of input rate on write). */
  cache_creation_input_tokens?: number
  /** OpenAI: cached input tokens (auto prompt caching). */
  prompt_cache_tokens?: number
}

export interface GenerateResult {
  text: string
  model: string
  usage: UsageMetrics
}

export interface ProviderDescriptor {
  id: string
  name: string
  baseUrl: string
  defaultModel: string
  generate(opts: GenerateOpts): Promise<string>
  /**
   * Preferred API: returns text + usage metrics + resolved model.
   * Enables prompt cache markers + cost telemetry.
   * Optional for now (backward compat); will become required post-ADR-020.
   */
  generateWithUsage?(opts: GenerateOpts): Promise<GenerateResult>
}

export class ProviderError extends Error {
  readonly providerId: string
  readonly status: number
  readonly body: string
  constructor(providerId: string, status: number, body: string) {
    super(`provider ${providerId}: HTTP ${status}: ${body}`)
    this.name = "ProviderError"
    this.providerId = providerId
    this.status = status
    this.body = body
  }
}

export class ProviderCatalog {
  private readonly kernel?: SafetyKernel
  private providers = new Map<string, ProviderDescriptor>()

  constructor(cfg: { kernel?: SafetyKernel } = {}) {
    this.kernel = cfg.kernel
  }

  register(descriptor: ProviderDescriptor): void {
    if (this.providers.has(descriptor.id)) {
      throw new Error(`provider ${descriptor.id} already registered`)
    }
    this.providers.set(descriptor.id, descriptor)
  }

  get(id: string): ProviderDescriptor {
    const d = this.providers.get(id)
    if (!d) throw new Error(`provider ${id} not registered`)
    return d
  }

  list(): ProviderDescriptor[] {
    return [...this.providers.values()]
  }

  async generate(id: string, opts: GenerateOpts, ctx?: KernelContext): Promise<string> {
    return (await this.generateWithUsage(id, opts, ctx)).text
  }

  async generateWithUsage(id: string, opts: GenerateOpts, ctx?: KernelContext): Promise<GenerateResult> {
    const d = this.get(id)
    if (this.kernel) {
      return this.generateViaKernel(d, opts, ctx)
    }
    if (d.generateWithUsage) return d.generateWithUsage(opts)
    // Legacy adapter — return zeroed usage (caller can detect absence)
    const text = await d.generate(opts)
    return {
      text,
      model: opts.model ?? d.defaultModel,
      usage: { input_tokens: 0, output_tokens: 0 },
    }
  }

  private async generateViaKernel(
    descriptor: ProviderDescriptor,
    opts: GenerateOpts,
    ctx?: KernelContext,
  ): Promise<GenerateResult> {
    let result: GenerateResult | null = null
    for await (const _event of this.kernel!.invoke(
      ctx ?? { actor: `provider:${descriptor.id}` },
      {
        kind: "provider",
        tool: descriptor.id,
        action: "provider.generate",
        inputText: [opts.system, opts.prompt].filter(Boolean).join("\n\n"),
        input: {
          prompt: opts.prompt,
          model: opts.model,
          maxTokens: opts.maxTokens,
          temperature: opts.temperature,
          system: opts.system,
          cacheSystem: opts.cacheSystem,
        },
        target: descriptor.baseUrl,
        execute: async function* () {
          result = descriptor.generateWithUsage
            ? await descriptor.generateWithUsage(opts)
            : {
                text: await descriptor.generate(opts),
                model: opts.model ?? descriptor.defaultModel,
                usage: { input_tokens: 0, output_tokens: 0 },
              }
          if (result.text) yield { type: "text" as const, content: result.text }
          yield { type: "completed" as const }
        },
      },
    )) {
      // Kernel handles permission/safety/audit; ProviderCatalog returns structured result only.
    }
    return result ?? { text: "", model: opts.model ?? descriptor.defaultModel, usage: { input_tokens: 0, output_tokens: 0 } }
  }
}
