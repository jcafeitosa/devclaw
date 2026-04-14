import type { LSPClient } from "./client.ts"

export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

export interface TextEdit {
  range: Range
  newText: string
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>
  documentChanges?: unknown[]
}

export interface SymbolInformation {
  name: string
  kind?: number
  location?: { uri: string; range: Range }
  containerName?: string
}

export interface CodeActionContext {
  diagnostics: unknown[]
  only?: string[]
}

export interface CodeAction {
  title: string
  kind?: string
  edit?: WorkspaceEdit
  command?: { title: string; command: string; arguments?: unknown[] }
}

export interface FormattingOptions {
  tabSize: number
  insertSpaces: boolean
  trimTrailingWhitespace?: boolean
  insertFinalNewline?: boolean
}

const DEFAULT_FORMAT: FormattingOptions = {
  tabSize: 2,
  insertSpaces: true,
  trimTrailingWhitespace: true,
  insertFinalNewline: true,
}

function textDoc(uri: string): { textDocument: { uri: string } } {
  return { textDocument: { uri } }
}

export class LSPAgentTools {
  constructor(private readonly client: LSPClient) {}

  async rename(uri: string, position: Position, newName: string): Promise<WorkspaceEdit> {
    return this.client.call<WorkspaceEdit>("textDocument/rename", {
      ...textDoc(uri),
      position,
      newName,
    })
  }

  async workspaceSymbols(query: string, limit?: number): Promise<SymbolInformation[]> {
    const result = await this.client.call<SymbolInformation[] | null>("workspace/symbol", { query })
    const items = result ?? []
    return limit ? items.slice(0, limit) : items
  }

  async codeActions(
    uri: string,
    range: Range,
    context: CodeActionContext = { diagnostics: [] },
  ): Promise<CodeAction[]> {
    const result = await this.client.call<CodeAction[] | null>("textDocument/codeAction", {
      ...textDoc(uri),
      range,
      context,
    })
    return result ?? []
  }

  async format(uri: string, options: Partial<FormattingOptions> = {}): Promise<TextEdit[]> {
    const opts: FormattingOptions = { ...DEFAULT_FORMAT, ...options }
    const result = await this.client.call<TextEdit[] | null>("textDocument/formatting", {
      ...textDoc(uri),
      options: opts,
    })
    return result ?? []
  }

  async hover(uri: string, position: Position): Promise<unknown> {
    return this.client.call("textDocument/hover", { ...textDoc(uri), position })
  }

  async definition(uri: string, position: Position): Promise<unknown> {
    return this.client.call("textDocument/definition", { ...textDoc(uri), position })
  }

  async references(uri: string, position: Position, includeDeclaration = true): Promise<unknown> {
    return this.client.call("textDocument/references", {
      ...textDoc(uri),
      position,
      context: { includeDeclaration },
    })
  }

  async completion(uri: string, position: Position): Promise<unknown> {
    return this.client.call("textDocument/completion", { ...textDoc(uri), position })
  }
}
