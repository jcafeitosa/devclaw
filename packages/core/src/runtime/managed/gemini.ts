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

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
const DEFAULT_MODEL = "gemini-2.0-flash"
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_MAX_ITERATIONS = 16

export interface GeminiManagedAgentsAdapterConfig {
  apiKey: string
  fetcher?: typeof fetch
  toolHandler?: ManagedAgentToolHandler
  maxIterations?: number
  baseUrl?: string
}

interface GeminiPart {
  text?: string
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: unknown }
}

interface GeminiContent {
  role: "user" | "model"
  parts: GeminiPart[]
}

interface GeminiResponse {
  candidates?: { content: GeminiContent; finishReason?: string }[]
  usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number }
}

export class GeminiManagedAgentsAdapter implements ManagedAgentAdapter {
  readonly kind = "gemini-managed"
  private readonly cfg: GeminiManagedAgentsAdapterConfig
  private readonly fetcher: typeof fetch
  private readonly maxIterations: number
  private readonly baseUrl: string

  constructor(cfg: GeminiManagedAgentsAdapterConfig) {
    this.cfg = cfg
    this.fetcher = cfg.fetcher ?? fetch
    this.maxIterations = cfg.maxIterations ?? DEFAULT_MAX_ITERATIONS
    this.baseUrl = cfg.baseUrl ?? GEMINI_BASE
  }

  async start(spec: ManagedAgentSpec): Promise<ManagedAgentSession> {
    const id = `gem_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
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
    const contents: GeminiContent[] = spec.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
      }))
    const usage: ManagedAgentUsage = { input_tokens: 0, output_tokens: 0 }
    let toolCalls = 0
    for (let iter = 0; iter < this.maxIterations; iter++) {
      const response = await this.callGemini(spec, contents)
      if (interrupted.value) throw new ManagedAgentInterruptedError()
      if (response.usageMetadata) {
        usage.input_tokens += response.usageMetadata.promptTokenCount
        usage.output_tokens += response.usageMetadata.candidatesTokenCount
      }
      const candidate = response.candidates?.[0]
      if (!candidate) {
        return { text: "", stopReason: "no_candidate", toolCalls, usage }
      }
      contents.push(candidate.content)
      const fnCalls = candidate.content.parts.filter((p) => p.functionCall)
      if (fnCalls.length === 0) {
        const text = candidate.content.parts
          .map((p) => p.text ?? "")
          .filter(Boolean)
          .join("")
        return {
          text,
          stopReason: candidate.finishReason ?? "STOP",
          toolCalls,
          usage,
        }
      }
      const handler = this.cfg.toolHandler
      const responseParts: GeminiPart[] = []
      for (const part of fnCalls) {
        toolCalls++
        const call = part.functionCall!
        const out = handler ? await handler(call.name, call.args) : { error: "no handler" }
        responseParts.push({ functionResponse: { name: call.name, response: out } })
      }
      contents.push({ role: "user", parts: responseParts })
    }
    throw new ManagedAgentIterationLimitError(this.maxIterations)
  }

  private async callGemini(
    spec: ManagedAgentSpec,
    contents: GeminiContent[],
  ): Promise<GeminiResponse> {
    const model = spec.model ?? DEFAULT_MODEL
    const url = `${this.baseUrl}/${model}:generateContent?key=${encodeURIComponent(this.cfg.apiKey)}`
    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: spec.maxTokens ?? DEFAULT_MAX_TOKENS },
    }
    if (spec.systemPrompt) {
      body.systemInstruction = { parts: [{ text: spec.systemPrompt }] }
    }
    if (spec.tools && spec.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: spec.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
          })),
        },
      ]
    }
    const res = await this.fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(`gemini api error: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as GeminiResponse
  }
}
