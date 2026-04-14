import {
  errorResponse,
  isNotification,
  isRequest,
  JsonRpcError,
  type JsonRpcMessage,
  parseMessage,
  successResponse,
} from "./jsonrpc.ts"
import {
  MCP_PROTOCOL_VERSION,
  type MCPCapabilities,
  type MCPInitializeParams,
  type MCPInitializeResult,
  type MCPPromptDefinition,
  type MCPPromptDescriptor,
  type MCPResourceContents,
  type MCPResourceDefinition,
  type MCPResourceDescriptor,
  type MCPToolCallResult,
  type MCPToolDefinition,
  type MCPToolDescriptor,
} from "./mcp_types.ts"

export interface MCPConsumerPolicy {
  toolsAllowed?: string[]
  toolsDenied?: string[]
  resourcesAllowed?: string[]
  resourcesDenied?: string[]
  promptsAllowed?: string[]
  promptsDenied?: string[]
}

export type MCPAuditOutcome = "allowed" | "denied" | "error"

export interface MCPAuditEvent {
  at: number
  consumerId?: string
  method: string
  toolName?: string
  resourceUri?: string
  promptName?: string
  outcome: MCPAuditOutcome
  reason?: string
}

export type MCPAuditSink = (event: MCPAuditEvent) => void

export interface MCPHandleContext {
  consumerId?: string
}

export interface MCPServerConfig {
  serverName: string
  serverVersion: string
  capabilities?: MCPCapabilities
  policies?: Record<string, MCPConsumerPolicy>
  defaultPolicy?: MCPConsumerPolicy
  audit?: MCPAuditSink
}

export class MCPServer {
  private readonly tools = new Map<string, MCPToolDefinition>()
  private readonly resources = new Map<string, MCPResourceDefinition>()
  private readonly prompts = new Map<string, MCPPromptDefinition>()
  private readonly serverName: string
  private readonly serverVersion: string
  private readonly capabilities: MCPCapabilities
  private readonly policies: Record<string, MCPConsumerPolicy>
  private readonly defaultPolicy: MCPConsumerPolicy
  private readonly audit?: MCPAuditSink

  constructor(cfg: MCPServerConfig) {
    this.serverName = cfg.serverName
    this.serverVersion = cfg.serverVersion
    this.capabilities = cfg.capabilities ?? {
      tools: { listChanged: false },
      resources: { listChanged: false },
      prompts: { listChanged: false },
    }
    this.policies = cfg.policies ?? {}
    this.defaultPolicy = cfg.defaultPolicy ?? {}
    this.audit = cfg.audit
  }

  registerTool(def: MCPToolDefinition): void {
    this.tools.set(def.name, def)
  }

  registerResource(def: MCPResourceDefinition): void {
    this.resources.set(def.uri, def)
  }

  registerPrompt(def: MCPPromptDefinition): void {
    this.prompts.set(def.name, def)
  }

  async handle(raw: string, ctx: MCPHandleContext = {}): Promise<string | null> {
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
        await this.dispatch(message.method, message.params, ctx)
      } catch {
        // swallow
      }
      return null
    }
    if (!isRequest(message)) return null
    const req = message as { id: number | string | null; method: string; params: unknown }
    try {
      const result = await this.dispatch(req.method, req.params, ctx)
      return JSON.stringify(successResponse(req.id, result))
    } catch (err) {
      const rpc =
        err instanceof JsonRpcError
          ? err
          : JsonRpcError.internal(err instanceof Error ? err.message : String(err))
      return JSON.stringify(errorResponse(req.id, rpc))
    }
  }

  private async dispatch(method: string, params: unknown, ctx: MCPHandleContext): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.onInitialize((params ?? {}) as MCPInitializeParams)
      case "ping":
        return {}
      case "tools/list":
        return { tools: this.listToolDescriptors(ctx) }
      case "tools/call":
        return this.callTool((params ?? {}) as { name: string; arguments?: unknown }, ctx)
      case "resources/list":
        return { resources: this.listResourceDescriptors(ctx) }
      case "resources/read":
        return this.readResource((params ?? {}) as { uri: string }, ctx)
      case "prompts/list":
        return { prompts: this.listPromptDescriptors(ctx) }
      case "prompts/get":
        return this.getPrompt(
          (params ?? {}) as { name: string; arguments?: Record<string, string> },
          ctx,
        )
      default:
        throw JsonRpcError.methodNotFound(method)
    }
  }

  private onInitialize(_params: MCPInitializeParams): MCPInitializeResult {
    return {
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: { name: this.serverName, version: this.serverVersion },
      capabilities: this.capabilities,
    }
  }

  private listToolDescriptors(ctx: MCPHandleContext): MCPToolDescriptor[] {
    return [...this.tools.values()]
      .filter((t) => this.toolAllowed(t.name, ctx))
      .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
  }

  private listResourceDescriptors(ctx: MCPHandleContext): MCPResourceDescriptor[] {
    return [...this.resources.values()]
      .filter((r) => this.resourceAllowed(r.uri, ctx))
      .map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      }))
  }

  private listPromptDescriptors(ctx: MCPHandleContext): MCPPromptDescriptor[] {
    return [...this.prompts.values()]
      .filter((p) => this.promptAllowed(p.name, ctx))
      .map((p) => ({ name: p.name, description: p.description, arguments: p.arguments }))
  }

  private async callTool(
    params: { name: string; arguments?: unknown },
    ctx: MCPHandleContext,
  ): Promise<MCPToolCallResult> {
    if (!this.toolAllowed(params.name, ctx)) {
      this.logAudit({
        method: "tools/call",
        toolName: params.name,
        consumerId: ctx.consumerId,
        outcome: "denied",
        reason: "policy",
      })
      return {
        isError: true,
        content: [{ type: "text", text: `denied by policy: ${params.name}` }],
      }
    }
    const tool = this.tools.get(params.name)
    if (!tool) {
      this.logAudit({
        method: "tools/call",
        toolName: params.name,
        consumerId: ctx.consumerId,
        outcome: "error",
        reason: "unknown tool",
      })
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool: ${params.name}` }],
      }
    }
    try {
      const out = await tool.handler(params.arguments ?? {})
      this.logAudit({
        method: "tools/call",
        toolName: params.name,
        consumerId: ctx.consumerId,
        outcome: "allowed",
      })
      return {
        content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out) }],
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logAudit({
        method: "tools/call",
        toolName: params.name,
        consumerId: ctx.consumerId,
        outcome: "error",
        reason: msg,
      })
      return { isError: true, content: [{ type: "text", text: msg }] }
    }
  }

  private async readResource(
    params: { uri: string },
    ctx: MCPHandleContext,
  ): Promise<{ contents: MCPResourceContents[] }> {
    if (!this.resourceAllowed(params.uri, ctx)) {
      this.logAudit({
        method: "resources/read",
        resourceUri: params.uri,
        consumerId: ctx.consumerId,
        outcome: "denied",
      })
      throw JsonRpcError.invalidParams(`denied by policy: ${params.uri}`)
    }
    const res = this.resources.get(params.uri)
    if (!res) {
      this.logAudit({
        method: "resources/read",
        resourceUri: params.uri,
        consumerId: ctx.consumerId,
        outcome: "error",
        reason: "unknown",
      })
      throw JsonRpcError.invalidParams(`unknown resource: ${params.uri}`)
    }
    const text = await res.read()
    this.logAudit({
      method: "resources/read",
      resourceUri: params.uri,
      consumerId: ctx.consumerId,
      outcome: "allowed",
    })
    return { contents: [{ uri: res.uri, mimeType: res.mimeType, text }] }
  }

  private getPrompt(
    params: { name: string; arguments?: Record<string, string> },
    ctx: MCPHandleContext,
  ): { messages: ReturnType<MCPPromptDefinition["build"]>["messages"] } {
    if (!this.promptAllowed(params.name, ctx)) {
      this.logAudit({
        method: "prompts/get",
        promptName: params.name,
        consumerId: ctx.consumerId,
        outcome: "denied",
      })
      throw JsonRpcError.invalidParams(`denied by policy: ${params.name}`)
    }
    const p = this.prompts.get(params.name)
    if (!p) throw JsonRpcError.invalidParams(`unknown prompt: ${params.name}`)
    this.logAudit({
      method: "prompts/get",
      promptName: params.name,
      consumerId: ctx.consumerId,
      outcome: "allowed",
    })
    return p.build(params.arguments ?? {})
  }

  private policyFor(consumerId?: string): MCPConsumerPolicy {
    if (!consumerId) return this.defaultPolicy
    return this.policies[consumerId] ?? this.defaultPolicy
  }

  private toolAllowed(name: string, ctx: MCPHandleContext): boolean {
    return this.checkPolicy(this.policyFor(ctx.consumerId), "tools", name)
  }

  private resourceAllowed(uri: string, ctx: MCPHandleContext): boolean {
    return this.checkPolicy(this.policyFor(ctx.consumerId), "resources", uri)
  }

  private promptAllowed(name: string, ctx: MCPHandleContext): boolean {
    return this.checkPolicy(this.policyFor(ctx.consumerId), "prompts", name)
  }

  private checkPolicy(
    policy: MCPConsumerPolicy,
    kind: "tools" | "resources" | "prompts",
    id: string,
  ): boolean {
    const allowed = policy[`${kind}Allowed`] as string[] | undefined
    const denied = policy[`${kind}Denied`] as string[] | undefined
    if (denied?.includes(id)) return false
    if (allowed && !allowed.includes(id)) return false
    return true
  }

  private logAudit(event: Omit<MCPAuditEvent, "at">): void {
    this.audit?.({ at: Date.now(), ...event })
  }
}
