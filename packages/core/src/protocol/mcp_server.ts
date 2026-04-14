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

export interface MCPServerConfig {
  serverName: string
  serverVersion: string
  capabilities?: MCPCapabilities
}

export class MCPServer {
  private readonly tools = new Map<string, MCPToolDefinition>()
  private readonly resources = new Map<string, MCPResourceDefinition>()
  private readonly prompts = new Map<string, MCPPromptDefinition>()
  private readonly serverName: string
  private readonly serverVersion: string
  private readonly capabilities: MCPCapabilities

  constructor(cfg: MCPServerConfig) {
    this.serverName = cfg.serverName
    this.serverVersion = cfg.serverVersion
    this.capabilities = cfg.capabilities ?? {
      tools: { listChanged: false },
      resources: { listChanged: false },
      prompts: { listChanged: false },
    }
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
        // swallow
      }
      return null
    }
    if (!isRequest(message)) return null
    try {
      const result = await this.dispatch(message.method, message.params)
      return JSON.stringify(successResponse(message.id, result))
    } catch (err) {
      const rpc =
        err instanceof JsonRpcError
          ? err
          : JsonRpcError.internal(err instanceof Error ? err.message : String(err))
      return JSON.stringify(errorResponse(message.id, rpc))
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.onInitialize((params ?? {}) as MCPInitializeParams)
      case "ping":
        return {}
      case "tools/list":
        return { tools: this.listToolDescriptors() }
      case "tools/call":
        return this.callTool((params ?? {}) as { name: string; arguments?: unknown })
      case "resources/list":
        return { resources: this.listResourceDescriptors() }
      case "resources/read":
        return this.readResource((params ?? {}) as { uri: string })
      case "prompts/list":
        return { prompts: this.listPromptDescriptors() }
      case "prompts/get":
        return this.getPrompt(
          (params ?? {}) as { name: string; arguments?: Record<string, string> },
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

  private listToolDescriptors(): MCPToolDescriptor[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }))
  }

  private listResourceDescriptors(): MCPResourceDescriptor[] {
    return [...this.resources.values()].map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    }))
  }

  private listPromptDescriptors(): MCPPromptDescriptor[] {
    return [...this.prompts.values()].map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments,
    }))
  }

  private async callTool(params: {
    name: string
    arguments?: unknown
  }): Promise<MCPToolCallResult> {
    const tool = this.tools.get(params.name)
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool: ${params.name}` }],
      }
    }
    try {
      const out = await tool.handler(params.arguments ?? {})
      return {
        content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out) }],
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { isError: true, content: [{ type: "text", text: msg }] }
    }
  }

  private async readResource(params: {
    uri: string
  }): Promise<{ contents: MCPResourceContents[] }> {
    const res = this.resources.get(params.uri)
    if (!res) throw JsonRpcError.invalidParams(`unknown resource: ${params.uri}`)
    const text = await res.read()
    return { contents: [{ uri: res.uri, mimeType: res.mimeType, text }] }
  }

  private getPrompt(params: { name: string; arguments?: Record<string, string> }): {
    messages: ReturnType<MCPPromptDefinition["build"]>["messages"]
  } {
    const p = this.prompts.get(params.name)
    if (!p) throw JsonRpcError.invalidParams(`unknown prompt: ${params.name}`)
    return p.build(params.arguments ?? {})
  }
}
