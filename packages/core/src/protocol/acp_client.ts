import {
  errorResponse,
  isNotification,
  isRequest,
  isResponse,
  JsonRpcError,
  type JsonRpcId,
  type JsonRpcMessage,
  type JsonRpcResponse,
  makeNotification,
  makeRequest,
  parseMessage,
  successResponse,
} from "./jsonrpc.ts"

export type ACPClientSend = (raw: string) => void | Promise<void>

export interface ACPClientConfig {
  send: ACPClientSend
  onRequest?: (method: string, params: unknown) => Promise<unknown> | unknown
  onNotification?: (method: string, params: unknown) => Promise<void> | void
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: unknown) => void
}

export class ACPClient {
  private readonly send: ACPClientSend
  private readonly onRequest?: ACPClientConfig["onRequest"]
  private readonly onNotification?: ACPClientConfig["onNotification"]
  private readonly pending = new Map<string | number, Pending>()
  private nextId = 1
  private closed = false

  constructor(cfg: ACPClientConfig) {
    this.send = cfg.send
    this.onRequest = cfg.onRequest
    this.onNotification = cfg.onNotification
  }

  call<R = unknown>(method: string, params?: unknown): Promise<R> {
    if (this.closed) return Promise.reject(new Error("ACPClient is closed"))
    const id = this.nextId++
    const req = makeRequest(id, method, params)
    return new Promise<R>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      Promise.resolve(this.send(JSON.stringify(req))).catch((err) => {
        this.pending.delete(id)
        reject(err)
      })
    })
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return
    void this.send(JSON.stringify(makeNotification(method, params)))
  }

  async handleMessage(raw: string): Promise<void> {
    let msg: JsonRpcMessage
    try {
      msg = parseMessage(raw)
    } catch {
      return
    }
    if (isResponse(msg)) {
      this.resolveResponse(msg)
      return
    }
    if (isNotification(msg)) {
      await this.onNotification?.(msg.method, msg.params)
      return
    }
    if (!isRequest(msg)) return
    const req = msg as { id: JsonRpcId; method: string; params: unknown }
    await this.respondToRequest(req.id, req.method, req.params)
  }

  close(reason?: Error): void {
    this.closed = true
    const err = reason ?? new Error("ACPClient closed")
    for (const p of this.pending.values()) p.reject(err)
    this.pending.clear()
  }

  private resolveResponse(msg: JsonRpcResponse): void {
    if (msg.id === null || msg.id === undefined) return
    const p = this.pending.get(msg.id)
    if (!p) return
    this.pending.delete(msg.id)
    if ("error" in msg && msg.error) {
      const e = msg.error
      p.reject(new JsonRpcError(e.code, e.message, e.data))
      return
    }
    if ("result" in msg) p.resolve(msg.result)
  }

  private async respondToRequest(id: JsonRpcId, method: string, params: unknown): Promise<void> {
    if (!this.onRequest) {
      await this.send(JSON.stringify(errorResponse(id, JsonRpcError.methodNotFound(method))))
      return
    }
    try {
      const result = await this.onRequest(method, params)
      await this.send(JSON.stringify(successResponse(id, result)))
    } catch (err) {
      const rpc =
        err instanceof JsonRpcError
          ? err
          : JsonRpcError.internal(err instanceof Error ? err.message : String(err))
      await this.send(JSON.stringify(errorResponse(id, rpc)))
    }
  }
}
