import {
  type ManagedAgentAdapter,
  ManagedAgentInterruptedError,
  ManagedAgentIterationLimitError,
  type ManagedAgentResult,
  type ManagedAgentSession,
  type ManagedAgentSpec,
  type ManagedAgentStatus,
  type ManagedAgentToolHandler,
  type ManagedAgentUsage,
} from "./types.ts"

const OPENAI_API = "https://api.openai.com/v1/chat/completions"
const DEFAULT_MODEL = "gpt-5"
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_MAX_ITERATIONS = 16

export interface OpenAIAssistantsAdapterConfig {
  apiKey: string
  fetcher?: typeof fetch
  toolHandler?: ManagedAgentToolHandler
  maxIterations?: number
  baseUrl?: string
  organization?: string
}

interface OpenAIChoice {
  index: number
  finish_reason: string
  message: {
    role: "assistant"
    content: string | null
    tool_calls?: {
      id: string
      type: "function"
      function: { name: string; arguments: string }
    }[]
  }
}

interface OpenAIResponse {
  id: string
  choices: OpenAIChoice[]
  usage?: { prompt_tokens: number; completion_tokens: number }
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: OpenAIChoice["message"]["tool_calls"]
}

export class OpenAIAssistantsAdapter implements ManagedAgentAdapter {
  readonly kind = "openai-assistants"
  private readonly cfg: OpenAIAssistantsAdapterConfig
  private readonly fetcher: typeof fetch
  private readonly maxIterations: number
  private readonly baseUrl: string

  constructor(cfg: OpenAIAssistantsAdapterConfig) {
    this.cfg = cfg
    this.fetcher = cfg.fetcher ?? fetch
    this.maxIterations = cfg.maxIterations ?? DEFAULT_MAX_ITERATIONS
    this.baseUrl = cfg.baseUrl ?? OPENAI_API
  }

  async start(spec: ManagedAgentSpec): Promise<ManagedAgentSession> {
    const id = `oai_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
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
    const messages: OpenAIMessage[] = []
    if (spec.systemPrompt) messages.push({ role: "system", content: spec.systemPrompt })
    for (const m of spec.messages) {
      messages.push({
        role: m.role,
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })
    }
    const usage: ManagedAgentUsage = { input_tokens: 0, output_tokens: 0 }
    let toolCalls = 0
    for (let iter = 0; iter < this.maxIterations; iter++) {
      const response = await this.callOpenAI(spec, messages)
      if (interrupted.value) throw new ManagedAgentInterruptedError()
      if (response.usage) {
        usage.input_tokens += response.usage.prompt_tokens
        usage.output_tokens += response.usage.completion_tokens
      }
      const choice = response.choices[0]
      if (!choice) {
        return { text: "", stopReason: "no_choice", toolCalls, usage }
      }
      messages.push({
        role: "assistant",
        content: choice.message.content,
        tool_calls: choice.message.tool_calls,
      })
      if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) {
        return {
          text: choice.message.content ?? "",
          stopReason: choice.finish_reason,
          toolCalls,
          usage,
        }
      }
      const handler = this.cfg.toolHandler
      for (const call of choice.message.tool_calls) {
        toolCalls++
        let parsed: unknown = {}
        try {
          parsed = JSON.parse(call.function.arguments)
        } catch {
          parsed = call.function.arguments
        }
        const out = handler ? await handler(call.function.name, parsed) : { error: "no handler" }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: typeof out === "string" ? out : JSON.stringify(out),
        })
      }
    }
    throw new ManagedAgentIterationLimitError(this.maxIterations)
  }

  private async callOpenAI(
    spec: ManagedAgentSpec,
    messages: OpenAIMessage[],
  ): Promise<OpenAIResponse> {
    const body: Record<string, unknown> = {
      model: spec.model ?? DEFAULT_MODEL,
      max_tokens: spec.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages,
    }
    if (spec.tools && spec.tools.length > 0) {
      body.tools = spec.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }))
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.cfg.apiKey}`,
      "content-type": "application/json",
    }
    if (this.cfg.organization) headers["openai-organization"] = this.cfg.organization
    const res = await this.fetcher(this.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`openai api error: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as OpenAIResponse
  }
}
