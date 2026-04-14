import { EventEmitter } from "../util/event_emitter.ts"
import type { ACPPendingPermission, ACPPermissionRequestStore } from "./acp_permission_store.ts"
import type { ACPSessionStore } from "./acp_session_store.ts"
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
  ACPSessionState,
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
  sessionStore?: ACPSessionStore
  permissionStore?: ACPPermissionRequestStore
}

interface InflightPrompt {
  controller: AbortController
}

interface PendingServerRequest {
  sessionId: string
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

export class ACPServer {
  readonly events = new EventEmitter<ACPServerEvents>()
  readonly capabilities: ACPCapabilities
  private readonly handlers: ACPServerHandlers
  private readonly sessionStore?: ACPSessionStore
  private readonly permissionStore?: ACPPermissionRequestStore
  private readonly sessions = new Map<string, ACPSessionInfo>()
  private readonly inflight = new Map<string, InflightPrompt>()
  private readonly pendingServerReqs = new Map<number, PendingServerRequest>()
  private readonly agentName: string
  private readonly agentVersion: string
  private send?: (raw: string) => void | Promise<void>
  private initialized = false
  private nextServerReqId = 1

  constructor(cfg: ACPServerConfig) {
    this.agentName = cfg.agentName
    this.agentVersion = cfg.agentVersion
    this.capabilities = { ...DEFAULT_ACP_CAPABILITIES, ...(cfg.capabilities ?? {}) }
    this.handlers = cfg.handlers ?? {}
    this.send = cfg.send
    this.sessionStore = cfg.sessionStore
    this.permissionStore = cfg.permissionStore
  }

  setSend(send?: (raw: string) => void | Promise<void>): void {
    this.send = send
    if (send && this.initialized) {
      void this.replayPendingPermissions().catch(() => {})
    }
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
    return [...this.sessions.values()].map((session) => ({ ...session }))
  }

  async replayPendingPermissions(sessionId?: string): Promise<void> {
    if (!this.send || !this.permissionStore) return
    const items = await this.permissionStore.list({ sessionId })
    for (const item of items) {
      if (!this.pendingServerReqs.has(item.requestId)) continue
      if (!this.sessions.has(item.sessionId)) continue
      const msg = makeRequest(item.requestId, "session/permission/request", {
        sessionId: item.sessionId,
        ...item.request,
      })
      try {
        await Promise.resolve().then(() => this.send?.(JSON.stringify(msg)))
      } catch {
        return
      }
    }
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
    await this.hydrateSessions()
    const custom = await this.handlers.initialize?.(params)
    this.initialized = true
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
    const saved = this.registerSession(info)
    this.events.emit("session_opened", { info: saved })
    return saved
  }

  private async onSessionLoad(params: ACPSessionLoadParams): Promise<ACPSessionInfo> {
    const handler = this.handlers.loadSession
    if (handler) {
      const info = await handler(params)
      return this.registerSession(info)
    }
    const existing = this.sessions.get(params.sessionId)
    if (existing) return existing
    await this.hydrateSessions()
    const hydrated = this.sessions.get(params.sessionId)
    if (hydrated) return hydrated
    const persisted = await this.sessionStore?.get(params.sessionId)
    if (persisted) {
      return this.registerSession(persisted)
    }
    throw JsonRpcError.invalidParams(`session '${params.sessionId}' not found`)
  }

  private async onSessionClose(params: { sessionId: string }): Promise<{ closed: boolean }> {
    const inflight = this.inflight.get(params.sessionId)
    if (inflight) {
      inflight.controller.abort()
      this.inflight.delete(params.sessionId)
    }
    const closeErr = new Error(`session '${params.sessionId}' closed`)
    this.rejectPendingRequests(params.sessionId, closeErr)
    await this.clearPendingPermissions(params.sessionId)
    const existed = this.sessions.delete(params.sessionId)
    const persisted = await this.sessionStore?.delete(params.sessionId)
    await this.handlers.closeSession?.(params.sessionId)
    this.events.emit("session_closed", { sessionId: params.sessionId })
    return { closed: existed || Boolean(persisted) }
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
    this.updateSessionState(params.sessionId, "running")
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
      this.updateSessionState(params.sessionId, "idle")
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
    void Promise.resolve()
      .then(() => this.send?.(JSON.stringify(makeNotification("session/update", chunk))))
      .catch(() => {})
  }

  private requestPermissionFromClient(
    sessionId: string,
    req: ACPPermissionRequest,
  ): Promise<ACPPermissionDecision> {
    if (!this.send) {
      return Promise.reject(new Error("permission request requires transport send callback"))
    }
    if (!this.sessions.has(sessionId)) {
      return Promise.reject(new Error(`session '${sessionId}' not open`))
    }
    const id = this.nextServerReqId++
    return new Promise<ACPPermissionDecision>((resolve, reject) => {
      this.pendingServerReqs.set(id, {
        sessionId,
        resolve: resolve as (v: unknown) => void,
        reject,
      })
      const pending: ACPPendingPermission = {
        requestId: id,
        sessionId,
        request: { ...req, input: req.input },
        createdAt: Date.now(),
      }
      const savePending = this.permissionStore?.save(pending)
      if (savePending) void savePending.catch(() => {})
      this.updateSessionState(sessionId, "awaiting_permission")
      const msg = makeRequest(id, "session/permission/request", { sessionId, ...req })
      Promise.resolve()
        .then(() => this.send?.(JSON.stringify(msg)))
        .catch((err) => {
          this.pendingServerReqs.delete(id)
          const deletePending = this.permissionStore?.delete(id)
          if (deletePending) void deletePending.catch(() => {})
          this.updateSessionState(sessionId, "running")
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
    const deleteResponse = this.permissionStore?.delete(r.id)
    if (deleteResponse) void deleteResponse.catch(() => {})
    if (!pending) return
    this.pendingServerReqs.delete(r.id)
    this.updateSessionState(pending.sessionId, "running")
    if (r.error) {
      pending.reject(new JsonRpcError(r.error.code, r.error.message, r.error.data))
      return
    }
    pending.resolve(r.result)
  }

  private async hydrateSessions(): Promise<void> {
    if (!this.sessionStore) return
    const persisted = await this.sessionStore.list()
    for (const session of persisted) {
      const normalized = this.normalizeSession(session)
      this.sessions.set(normalized.id, normalized)
    }
  }

  private registerSession(info: ACPSessionInfo): ACPSessionInfo {
    const normalized = this.normalizeSession(info)
    this.sessions.set(normalized.id, normalized)
    const saveSession = this.sessionStore?.save(normalized)
    if (saveSession) void saveSession.catch(() => {})
    return normalized
  }

  private normalizeSession(info: ACPSessionInfo): ACPSessionInfo {
    const createdAt = info.createdAt ?? Date.now()
    return {
      ...info,
      createdAt,
      state: info.state ?? "idle",
      updatedAt: info.updatedAt ?? createdAt,
    }
  }

  private updateSessionState(sessionId: string, state: ACPSessionState): ACPSessionInfo | null {
    const current = this.sessions.get(sessionId)
    if (!current) return null
    const next: ACPSessionInfo = {
      ...current,
      state,
      updatedAt: Date.now(),
    }
    this.sessions.set(sessionId, next)
    const saveSession = this.sessionStore?.save(next)
    if (saveSession) void saveSession.catch(() => {})
    return next
  }

  private rejectPendingRequests(sessionId: string, err: Error): void {
    for (const [requestId, pending] of this.pendingServerReqs.entries()) {
      if (pending.sessionId !== sessionId) continue
      this.pendingServerReqs.delete(requestId)
      pending.reject(err)
    }
  }

  private async clearPendingPermissions(sessionId: string): Promise<void> {
    if (!this.permissionStore) return
    const pending = await this.permissionStore.list({ sessionId })
    for (const item of pending) {
      await this.permissionStore.delete(item.requestId)
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw JsonRpcError.invalidRequest("initialize() must be called first")
    }
  }
}
