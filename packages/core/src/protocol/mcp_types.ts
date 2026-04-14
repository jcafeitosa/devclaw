export const MCP_PROTOCOL_VERSION = "2025-03-26"

export interface MCPServerInfo {
  name: string
  version: string
}

export interface MCPClientInfo {
  name: string
  version: string
}

export interface MCPInitializeParams {
  protocolVersion?: string
  clientInfo: MCPClientInfo
  capabilities?: MCPCapabilities
}

export interface MCPCapabilities {
  tools?: { listChanged?: boolean }
  resources?: { listChanged?: boolean; subscribe?: boolean }
  prompts?: { listChanged?: boolean }
  logging?: Record<string, never>
}

export interface MCPInitializeResult {
  protocolVersion: string
  serverInfo: MCPServerInfo
  capabilities: MCPCapabilities
}

export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (input: unknown) => Promise<unknown> | unknown
}

export interface MCPToolDescriptor {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface MCPToolContent {
  type: "text"
  text: string
}

export interface MCPToolCallResult {
  content: MCPToolContent[]
  isError?: boolean
}

export interface MCPResourceDefinition {
  uri: string
  name: string
  description?: string
  mimeType?: string
  read: () => Promise<string> | string
}

export interface MCPResourceDescriptor {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPResourceContents {
  uri: string
  mimeType?: string
  text: string
}

export interface MCPPromptArgument {
  name: string
  description?: string
  required?: boolean
}

export interface MCPPromptMessage {
  role: "user" | "assistant" | "system"
  content: { type: "text"; text: string }
}

export interface MCPPromptDefinition {
  name: string
  description: string
  arguments?: MCPPromptArgument[]
  build: (args: Record<string, string>) => { messages: MCPPromptMessage[] }
}

export interface MCPPromptDescriptor {
  name: string
  description: string
  arguments?: MCPPromptArgument[]
}
