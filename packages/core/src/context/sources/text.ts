import type { ContextItem, ContextSource } from "../types.ts"

export interface TextFragment {
  id: string
  content: string
  kind?: string
  meta?: Record<string, string>
}

export interface TextFragmentsSourceConfig {
  id?: string
  fragments: TextFragment[]
}

export class TextFragmentsSource implements ContextSource {
  readonly id: string
  private fragments: TextFragment[]

  constructor(cfg: TextFragmentsSourceConfig) {
    this.id = cfg.id ?? "text-fragments"
    this.fragments = cfg.fragments
  }

  add(fragment: TextFragment): void {
    this.fragments.push(fragment)
  }

  async collect(): Promise<ContextItem[]> {
    return this.fragments.map<ContextItem>((f) => ({
      id: f.id,
      sourceId: this.id,
      kind: f.kind ?? "text",
      content: f.content,
      meta: f.meta,
    }))
  }
}
