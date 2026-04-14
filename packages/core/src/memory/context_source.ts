import type { ContextItem, ContextRequest, ContextSource } from "../context/types.ts"
import type { MemoryService } from "./service.ts"

export interface MemoryContextSourceConfig {
  service: MemoryService
  id?: string
  defaultLimit?: number
  minScore?: number
  sessionIdFrom?: (request: ContextRequest) => string | undefined
}

export class MemoryContextSource implements ContextSource {
  readonly id: string
  private readonly service: MemoryService
  private readonly defaultLimit: number
  private readonly minScore?: number
  private readonly sessionIdFrom?: (r: ContextRequest) => string | undefined

  constructor(cfg: MemoryContextSourceConfig) {
    this.service = cfg.service
    this.id = cfg.id ?? "memory"
    this.defaultLimit = cfg.defaultLimit ?? 5
    this.minScore = cfg.minScore
    this.sessionIdFrom = cfg.sessionIdFrom
  }

  async collect(request: ContextRequest): Promise<ContextItem[]> {
    const sessionId = this.sessionIdFrom?.(request) ?? request.sessionId
    return this.service.inject({
      text: request.goal,
      sessionId,
      limit: this.defaultLimit,
      minScore: this.minScore,
    })
  }
}
