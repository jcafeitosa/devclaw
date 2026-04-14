import {
  type ManagedAgentAdapter,
  ManagedAgentInterruptedError,
  ManagedAgentIterationLimitError,
  type ManagedAgentMessage,
  type ManagedAgentResult,
  type ManagedAgentSession,
  type ManagedAgentSpec,
  type ManagedAgentStatus,
  type ManagedAgentToolHandler,
  type ManagedAgentUsage,
} from "./types.ts"

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"
const DEFAULT_MODEL = "claude-opus-4-6"
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_MAX_ITERATIONS = 16

export interface AnthropicManagedAgentsAdapterConfig {
  apiKey: string
  fetcher?: typeof fetch
  toolHandler?: ManagedAgentToolHandler
  maxIterations?: number
  baseUrl?: string
}

interface AnthropicMessageResponse {
  id: string
  type: "message"
  role: "assistant"
  stop_reason: string
  content: { type: string; text?: string; id?: string; name?: string; input?: unknown }[]
  usage: ManagedAgentUsage
}

export class AnthropicManagedAgentsAdapter implements ManagedAgentAdapter {
  readonly kind = "anthropic-managed"
  private readonly cfg: AnthropicManagedAgentsAdapterConfig
  private readonly fetcher: typeof fetch
  private readonly maxIterations: number
  private readonly baseUrl: string

  constructor(cfg: AnthropicManagedAgentsAdapterConfig) {
    this.cfg = cfg
    this.fetcher = cfg.fetcher ?? fetch
    this.maxIterations = cfg.maxIterations ?? DEFAULT_MAX_ITERATIONS
    this.baseUrl = cfg.baseUrl ?? ANTHROPIC_API
  }

  async start(spec: ManagedAgentSpec): Promise<ManagedAgentSession> {
    const id = `mas_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    let status: ManagedAgentStatus = "running"
    const interrupted = { value: false }
    const promise = this.runLoop(spec, interrupted)
      .then((res) => {
        status = "completed"
        return res
      })
      .catch((err) => {
        status = err instanceof ManagedAgentInterruptedError ? "interrupted" : "failed"
        throw err
      })
    return {
      id,
      status: () => status,
      result: () => promise,
      interrupt: () => {
        if (status === "running") {
          interrupted.value = true
          status = "interrupted"
        }
      },
    }
  }

  private async runLoop(
    spec: ManagedAgentSpec,
    interrupted: { value: boolean },
  ): Promise<ManagedAgentResult> {
    const messages: ManagedAgentMessage[] = [...spec.messages]
    const usage: ManagedAgentUsage = { input_tokens: 0, output_tokens: 0 }
    let toolCalls = 0
    for (let iter = 0; iter < this.maxIterations; iter++) {
      const response = await this.callAnthropic(spec, messages)
      if (interrupted.value) throw new ManagedAgentInterruptedError()
      usage.input_tokens += response.usage.input_tokens
      usage.output_tokens += response.usage.output_tokens
      messages.push({ role: "assistant", content: response.content })
      if (response.stop_reason !== "tool_use") {
        return {
          text: extractText(response),
          stopReason: response.stop_reason,
          toolCalls,
          usage,
        }
      }
      const toolUses = response.content.filter((b) => b.type === "tool_use")
      if (toolUses.length === 0) {
        return { text: extractText(response), stopReason: response.stop_reason, toolCalls, usage }
      }
      const handler = this.cfg.toolHandler
      const toolResults: unknown[] = []
      for (const tu of toolUses) {
        toolCalls++
        const out = handler ? await handler(tu.name ?? "", tu.input ?? {}) : { error: "no handler" }
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: typeof out === "string" ? out : JSON.stringify(out),
        })
      }
      messages.push({ role: "user", content: toolResults })
    }
    throw new ManagedAgentIterationLimitError(this.maxIterations)
  }

  private async callAnthropic(
    spec: ManagedAgentSpec,
    messages: ManagedAgentMessage[],
  ): Promise<AnthropicMessageResponse> {
    const body: Record<string, unknown> = {
      model: spec.model ?? DEFAULT_MODEL,
      max_tokens: spec.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages,
    }
    if (spec.systemPrompt) body.system = spec.systemPrompt
    if (spec.tools && spec.tools.length > 0) body.tools = spec.tools
    if (spec.metadata) body.metadata = spec.metadata
    const res = await this.fetcher(this.baseUrl, {
      method: "POST",
      headers: {
        "x-api-key": this.cfg.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`anthropic api error: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as AnthropicMessageResponse
  }
}

function extractText(response: AnthropicMessageResponse): string {
  return response.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("")
}
