import { EventEmitter } from "../util/event_emitter.ts"
import type {
  ACPCapabilities,
  ACPInitializeParams,
  ACPInitializeResult,
  ACPPromptParams,
  ACPPromptResult,
  ACPSessionInfo,
  ACPSessionLoadParams,
  ACPSessionNewParams,
  ACPStreamChunk,
} from "./acp_types.ts"
import { DEFAULT_ACP_CAPABILITIES } from "./acp_types.ts"
import {
  errorResponse,
  isNotification,
  isRequest,
  JsonRpcError,
  type JsonRpcMessage,
  parseMessage,
  successResponse,
} from "./jsonrpc.ts"

export interface ACPServerEvents extends Record<string, unknown> {
  initialized: { params: ACPInitializeParams }
  session_opened: { info: ACPSessionInfo }
  session_closed: { sessionId: string }
  stream_chunk: ACPStreamChunk
}

export interface ACPServerHandlers {
  initialize?: (params: ACPInitializeParams) => Promise<ACPInitializeResult> | ACPInitializeResult
  createSession?: (params: ACPSessionNewParams) => Promise<ACPSessionInfo> | ACPSessionInfo
  loadSession?: (params: ACPSessionLoadParams) => Promise<ACPSessionInfo> | ACPSessionInfo
  prompt?: (params: ACPPromptParams) => Promise<ACPPromptResult> | ACPPromptResult
  closeSession?: (sessionId: string) => Promise<void> | void
}

export interface ACPServerConfig {
  agentName: string
  agentVersion: string
  capabilities?: Partial<ACPCapabilities>
  handlers?: ACPServerHandlers
}

export class ACPServer {
  readonly events = new EventEmitter<ACPServerEvents>()
  readonly capabilities: ACPCapabilities
  private readonly handlers: ACPServerHandlers
  private readonly sessions = new Map<string, ACPSessionInfo>()
  private readonly agentName: string
  private readonly agentVersion: string
  private initialized = false

  constructor(cfg: ACPServerConfig) {
    this.agentName = cfg.agentName
    this.agentVersion = cfg.agentVersion
    this.capabilities = { ...DEFAULT_ACP_CAPABILITIES, ...(cfg.capabilities ?? {}) }
    this.handlers = cfg.handlers ?? {}
  }

  async handle(raw: string): Promise<string | null> {
    let message: JsonRpcMessage
    try {
      message = parseMessage(raw)
    } catch (err) {
      if (err instanceof JsonRpcError) {
        return JSON.stringify(errorResponse(null, err))
      }
      throw err
    }
    if (isNotification(message)) {
      try {
        await this.dispatch(message.method, message.params)
      } catch {
        // notifications swallow errors
      }
      return null
    }
    if (!isRequest(message)) return null
    try {
      const result = await this.dispatch(message.method, message.params)
      return JSON.stringify(successResponse(message.id, result))
    } catch (err) {
      const rpcErr =
        err instanceof JsonRpcError
          ? err
          : JsonRpcError.internal(err instanceof Error ? err.message : String(err))
      return JSON.stringify(errorResponse(message.id, rpcErr))
    }
  }

  sendStreamChunk(chunk: ACPStreamChunk): void {
    this.events.emit("stream_chunk", chunk)
  }

  listSessions(): ACPSessionInfo[] {
    return [...this.sessions.values()]
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.onInitialize((params ?? {}) as ACPInitializeParams)
      case "session/new":
        this.ensureInitialized()
        return this.onSessionNew((params ?? {}) as ACPSessionNewParams)
      case "session/load":
        this.ensureInitialized()
        return this.onSessionLoad((params ?? {}) as ACPSessionLoadParams)
      case "session/close":
        this.ensureInitialized()
        return this.onSessionClose((params ?? {}) as { sessionId: string })
      case "prompt":
        this.ensureInitialized()
        return this.onPrompt((params ?? {}) as ACPPromptParams)
      case "capabilities":
        return { capabilities: this.capabilities }
      default:
        throw JsonRpcError.methodNotFound(method)
    }
  }

  private async onInitialize(params: ACPInitializeParams): Promise<ACPInitializeResult> {
    this.initialized = true
    const custom = await this.handlers.initialize?.(params)
    this.events.emit("initialized", { params })
    return (
      custom ?? {
        agentName: this.agentName,
        agentVersion: this.agentVersion,
        capabilities: this.capabilities,
      }
    )
  }

  private async onSessionNew(params: ACPSessionNewParams): Promise<ACPSessionInfo> {
    const handler = this.handlers.createSession
    const info: ACPSessionInfo = handler
      ? await handler(params)
      : {
          id: `sess_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
          createdAt: Date.now(),
          cwd: params.cwd,
          agentName: this.agentName,
        }
    this.sessions.set(info.id, info)
    this.events.emit("session_opened", { info })
    return info
  }

  private async onSessionLoad(params: ACPSessionLoadParams): Promise<ACPSessionInfo> {
    const handler = this.handlers.loadSession
    if (handler) {
      const info = await handler(params)
      this.sessions.set(info.id, info)
      return info
    }
    const existing = this.sessions.get(params.sessionId)
    if (!existing) throw JsonRpcError.invalidParams(`session '${params.sessionId}' not found`)
    return existing
  }

  private async onSessionClose(params: { sessionId: string }): Promise<{ closed: boolean }> {
    const existed = this.sessions.delete(params.sessionId)
    await this.handlers.closeSession?.(params.sessionId)
    this.events.emit("session_closed", { sessionId: params.sessionId })
    return { closed: existed }
  }

  private async onPrompt(params: ACPPromptParams): Promise<ACPPromptResult> {
    const handler = this.handlers.prompt
    if (!handler) {
      throw JsonRpcError.methodNotFound("prompt (no handler configured)")
    }
    if (!this.sessions.has(params.sessionId)) {
      throw JsonRpcError.invalidParams(`session '${params.sessionId}' not open`)
    }
    return handler(params)
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw JsonRpcError.invalidRequest("initialize() must be called first")
    }
  }
}
