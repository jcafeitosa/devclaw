import { InvalidLinkError, NotFoundError, ThreadClosedError } from "./errors.ts"
import type { Thread, ThreadLinks } from "./types.ts"

export interface CreateThreadInput {
  id?: string
  channelId: string
  title: string
  openedBy: string
  links: ThreadLinks
}

export interface ThreadStoreConfig {
  requiredLinks?: Array<keyof ThreadLinks>
}

export class ThreadStore {
  private readonly threads = new Map<string, Thread>()
  private readonly required: Array<keyof ThreadLinks>

  constructor(cfg: ThreadStoreConfig = {}) {
    this.required = cfg.requiredLinks ?? ["projectId"]
  }

  create(input: CreateThreadInput): Thread {
    const missing: string[] = []
    for (const key of this.required) {
      const v = input.links[key]
      if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) {
        missing.push(key)
      }
    }
    if (missing.length > 0) throw new InvalidLinkError(missing)
    const id = input.id ?? `th_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    const thread: Thread = {
      id,
      channelId: input.channelId,
      title: input.title,
      openedBy: input.openedBy,
      links: { ...input.links },
      open: true,
      createdAt: Date.now(),
    }
    this.threads.set(id, thread)
    return thread
  }

  get(id: string): Thread {
    const t = this.threads.get(id)
    if (!t) throw new NotFoundError("thread", id)
    return t
  }

  listByChannel(channelId: string): Thread[] {
    return [...this.threads.values()].filter((t) => t.channelId === channelId)
  }

  close(id: string, actor: string, reason?: string): Thread {
    const thread = this.get(id)
    if (!thread.open) throw new ThreadClosedError(id)
    thread.open = false
    thread.closedAt = Date.now()
    thread.closedBy = actor
    thread.closedReason = reason
    return thread
  }

  reopen(id: string): Thread {
    const thread = this.get(id)
    thread.open = true
    thread.closedAt = undefined
    thread.closedBy = undefined
    thread.closedReason = undefined
    return thread
  }
}
