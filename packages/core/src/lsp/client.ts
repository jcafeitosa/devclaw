import { encodeLspMessage, LspMessageStream } from "./framing.ts"

export interface LSPTransport {
  write(bytes: Uint8Array): void | Promise<void>
  onData(cb: (bytes: Uint8Array) => void): void
}

export interface LSPClientConfig {
  transport: LSPTransport
}

export interface InitializeParams {
  processId: number | null
  rootUri: string | null
  capabilities: Record<string, unknown>
  initializationOptions?: unknown
  workspaceFolders?: { uri: string; name: string }[]
}

export interface DidOpenParams {
  uri: string
  languageId: string
  version: number
  text: string
}

export interface DidChangeParams {
  uri: string
  version: number
  contentChanges: { text: string }[]
}

export interface DiagnosticsPayload {
  uri: string
  diagnostics: { message: string; severity?: number; range: unknown }[]
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

export class LSPClient {
  private readonly transport: LSPTransport
  private readonly stream = new LspMessageStream()
  private readonly pending = new Map<number, Pending>()
  private readonly diagnosticsHandlers: Array<(p: DiagnosticsPayload) => void> = []
  private nextId = 1

  constructor(cfg: LSPClientConfig) {
    this.transport = cfg.transport
    this.stream.onMessage((m) => this.dispatch(m))
    this.transport.onData((b) => this.stream.feed(b))
  }

  call<R = unknown>(method: string, params?: unknown): Promise<R> {
    const id = this.nextId++
    return new Promise<R>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      const bytes = encodeLspMessage({ jsonrpc: "2.0", id, method, params })
      Promise.resolve(this.transport.write(bytes)).catch((err) => {
        this.pending.delete(id)
        reject(err)
      })
    })
  }

  notify(method: string, params?: unknown): void {
    const bytes = encodeLspMessage({ jsonrpc: "2.0", method, params })
    void this.transport.write(bytes)
  }

  initialize(params: InitializeParams): Promise<unknown> {
    return this.call("initialize", params)
  }

  initialized(): void {
    this.notify("initialized", {})
  }

  didOpen(p: DidOpenParams): void {
    this.notify("textDocument/didOpen", {
      textDocument: { uri: p.uri, languageId: p.languageId, version: p.version, text: p.text },
    })
  }

  didChange(p: DidChangeParams): void {
    this.notify("textDocument/didChange", {
      textDocument: { uri: p.uri, version: p.version },
      contentChanges: p.contentChanges,
    })
  }

  didClose(uri: string): void {
    this.notify("textDocument/didClose", { textDocument: { uri } })
  }

  onDiagnostics(cb: (p: DiagnosticsPayload) => void): void {
    this.diagnosticsHandlers.push(cb)
  }

  shutdown(): Promise<unknown> {
    return this.call("shutdown")
  }

  exit(): void {
    this.notify("exit")
  }

  private dispatch(m: unknown): void {
    if (!m || typeof m !== "object") return
    const msg = m as {
      id?: number
      method?: string
      params?: unknown
      result?: unknown
      error?: unknown
    }
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(msg.error)
      else p.resolve(msg.result)
      return
    }
    if (msg.method === "textDocument/publishDiagnostics") {
      const payload = msg.params as DiagnosticsPayload
      for (const h of this.diagnosticsHandlers) h(payload)
    }
  }
}
