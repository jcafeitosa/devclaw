import { EventEmitter } from "../util/event_emitter.ts"
import type {
  ACPCapabilities,
  ACPInitializeParams,
  ACPInitializeResult,
  ACPPermissionDecision,
  ACPPermissionRequest,
  ACPPromptContent,
  ACPPromptParams,
  ACPPromptResult,
  ACPSessionInfo,
  ACPSessionLoadParams,
  ACPSessionNewParams,
  ACPStreamChunk,
  ACPStreamUpdate,
} from "./acp_types.ts"
import { DEFAULT_ACP_CAPABILITIES } from "./acp_types.ts"
import {
  errorResponse,
  isNotification,
  isRequest,
  isResponse,
  JsonRpcError,
  type JsonRpcMessage,
  makeNotification,
  makeRequest,
  parseMessage,
  successResponse,
} from "./jsonrpc.ts"

export interface ACPServerEvents extends Record<string, unknown> {
  initialized: { params: ACPInitializeParams }
  session_opened: { info: ACPSessionInfo }
  session_closed: { sessionId: string }
  stream_chunk: ACPStreamChunk
}

export interface ACPPromptContext {
  sessionId: string
  signal: AbortSignal
  update(u: ACPStreamUpdate): void
  requestPermission(req: ACPPermissionRequest): Promise<ACPPermissionDecision>
}

export interface ACPPromptParamsNormalized extends Omit<ACPPromptParams, "prompt"> {
  prompt: string | ACPPromptContent[]
  content: ACPPromptContent[]
}

export interface ACPServerHandlers {
  initialize?: (params: ACPInitializeParams) => Promise<ACPInitializeResult> | ACPInitializeResult
  createSession?: (params: ACPSessionNewParams) => Promise<ACPSessionInfo> | ACPSessionInfo
  loadSession?: (params: ACPSessionLoadParams) => Promise<ACPSessionInfo> | ACPSessionInfo
  prompt?: (
    params: ACPPromptParamsNormalized,
    ctx: ACPPromptContext,
  ) => Promise<ACPPromptResult> | ACPPromptResult
  closeSession?: (sessionId: string) => Promise<void> | void
}

export interface ACPServerConfig {
  agentName: string
  agentVersion: string
  capabilities?: Partial<ACPCapabilities>
  handlers?: ACPServerHandlers
  send?: (raw: string) => void | Promise<void>
}

interface InflightPrompt {
  controller: AbortController
}

interface PendingServerRequest {
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

export class ACPServer {
  readonly events = new EventEmitter<ACPServerEvents>()
  readonly capabilities: ACPCapabilities
  private readonly handlers: ACPServerHandlers
  private readonly sessions = new Map<string, ACPSessionInfo>()
  private readonly inflight = new Map<string, InflightPrompt>()
  private readonly pendingServerReqs = new Map<number, PendingServerRequest>()
  private readonly agentName: string
  private readonly agentVersion: string
  private readonly send?: (raw: string) => void | Promise<void>
  private initialized = false
  private nextServerReqId = 1

  constructor(cfg: ACPServerConfig) {
    this.agentName = cfg.agentName
    this.agentVersion = cfg.agentVersion
    this.capabilities = { ...DEFAULT_ACP_CAPABILITIES, ...(cfg.capabilities ?? {}) }
    this.handlers = cfg.handlers ?? {}
    this.send = cfg.send
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
    if (isResponse(message)) {
      this.resolveServerRequest(message)
      return null
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
    const req = message as { id: number | string | null; method: string; params: unknown }
    try {
      const result = await this.dispatch(req.method, req.params)
      return JSON.stringify(successResponse(req.id, result))
    } catch (err) {
      const rpcErr =
        err instanceof JsonRpcError
          ? err
          : JsonRpcError.internal(err instanceof Error ? err.message : String(err))
      return JSON.stringify(errorResponse(req.id, rpcErr))
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
      case "session/cancel":
        this.ensureInitialized()
        return this.onSessionCancel((params ?? {}) as { sessionId: string })
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

  private async onSessionCancel(params: { sessionId: string }): Promise<{ cancelled: boolean }> {
    const inflight = this.inflight.get(params.sessionId)
    if (!inflight) return { cancelled: false }
    inflight.controller.abort()
    return { cancelled: true }
  }

  private async onPrompt(params: ACPPromptParams): Promise<ACPPromptResult> {
    const handler = this.handlers.prompt
    if (!handler) {
      throw JsonRpcError.methodNotFound("prompt (no handler configured)")
    }
    if (!this.sessions.has(params.sessionId)) {
      throw JsonRpcError.invalidParams(`session '${params.sessionId}' not open`)
    }
    const content = this.normalizeContent(params.prompt)
    const controller = new AbortController()
    this.inflight.set(params.sessionId, { controller })
    const ctx: ACPPromptContext = {
      sessionId: params.sessionId,
      signal: controller.signal,
      update: (u) => this.emitUpdate(params.sessionId, u),
      requestPermission: (req) => this.requestPermissionFromClient(params.sessionId, req),
    }
    try {
      return await handler({ ...params, prompt: params.prompt, content }, ctx)
    } finally {
      this.inflight.delete(params.sessionId)
    }
  }

  private normalizeContent(prompt: string | ACPPromptContent[]): ACPPromptContent[] {
    if (typeof prompt === "string") return [{ type: "text", text: prompt }]
    return prompt
  }

  private emitUpdate(sessionId: string, update: ACPStreamUpdate): void {
    const chunk: ACPStreamChunk = {
      sessionId,
      kind: update.kind,
      content: update.content,
      payload: update.payload,
      at: Date.now(),
    }
    this.events.emit("stream_chunk", chunk)
    if (!this.send) return
    void this.send(JSON.stringify(makeNotification("session/update", chunk)))
  }

  private requestPermissionFromClient(
    sessionId: string,
    req: ACPPermissionRequest,
  ): Promise<ACPPermissionDecision> {
    if (!this.send) {
      return Promise.reject(new Error("permission request requires transport send callback"))
    }
    const id = this.nextServerReqId++
    return new Promise<ACPPermissionDecision>((resolve, reject) => {
      this.pendingServerReqs.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      })
      const msg = makeRequest(id, "session/permission/request", { sessionId, ...req })
      Promise.resolve(this.send!(JSON.stringify(msg))).catch((err) => {
        this.pendingServerReqs.delete(id)
        reject(err)
      })
    })
  }

  private resolveServerRequest(msg: JsonRpcMessage): void {
    const r = msg as {
      id?: number | string | null
      result?: unknown
      error?: { code: number; message: string; data?: unknown }
    }
    if (typeof r.id !== "number") return
    const pending = this.pendingServerReqs.get(r.id)
    if (!pending) return
    this.pendingServerReqs.delete(r.id)
    if (r.error) {
      pending.reject(new JsonRpcError(r.error.code, r.error.message, r.error.data))
      return
    }
    pending.resolve(r.result)
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw JsonRpcError.invalidRequest("initialize() must be called first")
    }
  }
}
