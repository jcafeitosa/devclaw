import type { ChannelRegistry } from "./channel.ts"
import type { CommEvent, CommMode } from "./types.ts"

export type CommListener<T = unknown> = (event: CommEvent<T>) => void

export interface DirectRoute {
  mode: "direct"
  from: string
  to: string
  payload: unknown
}

export interface BroadcastRoute {
  mode: "broadcast"
  from: string
  to?: string[]
  payload: unknown
}

export interface ChannelRoute {
  mode: "channel"
  from: string
  channelId: string
  content: string
  threadId?: string
}

export interface EventRoute {
  mode: "event"
  from: string
  topic: string
  payload: unknown
}

export type Route = DirectRoute | BroadcastRoute | ChannelRoute | EventRoute

export interface AgentCommRouterConfig {
  channels?: ChannelRegistry
}

function makeEvent(mode: CommMode, init: Partial<CommEvent>): CommEvent {
  return {
    id: `ev_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    mode,
    from: init.from ?? "unknown",
    to: init.to,
    channelId: init.channelId,
    topic: init.topic,
    payload: init.payload,
    at: Date.now(),
  }
}

export class AgentCommRouter {
  private readonly direct = new Map<string, Set<CommListener>>()
  private readonly broadcasts = new Set<CommListener>()
  private readonly topicListeners = new Map<string, Set<CommListener>>()
  private readonly channels?: ChannelRegistry

  constructor(cfg: AgentCommRouterConfig = {}) {
    this.channels = cfg.channels
  }

  onDirect(actor: string, listener: CommListener): () => void {
    let bucket = this.direct.get(actor)
    if (!bucket) {
      bucket = new Set()
      this.direct.set(actor, bucket)
    }
    bucket.add(listener)
    return () => {
      bucket?.delete(listener)
    }
  }

  onBroadcast(listener: CommListener): () => void {
    this.broadcasts.add(listener)
    return () => {
      this.broadcasts.delete(listener)
    }
  }

  onTopic(topic: string, listener: CommListener): () => void {
    let bucket = this.topicListeners.get(topic)
    if (!bucket) {
      bucket = new Set()
      this.topicListeners.set(topic, bucket)
    }
    bucket.add(listener)
    return () => {
      bucket?.delete(listener)
    }
  }

  send(route: Route): CommEvent {
    if (route.mode === "direct") {
      const event = makeEvent("direct", {
        from: route.from,
        to: route.to,
        payload: route.payload,
      })
      const bucket = this.direct.get(route.to)
      if (bucket) for (const fn of bucket) fn(event)
      return event
    }
    if (route.mode === "broadcast") {
      const event = makeEvent("broadcast", {
        from: route.from,
        to: route.to,
        payload: route.payload,
      })
      for (const fn of this.broadcasts) fn(event)
      return event
    }
    if (route.mode === "channel") {
      if (!this.channels) {
        throw new Error("AgentCommRouter: channel mode requires a ChannelRegistry")
      }
      const message = this.channels.post(route.channelId, route.from, route.content, route.threadId)
      return makeEvent("channel", {
        from: route.from,
        channelId: route.channelId,
        payload: message,
      })
    }
    const event = makeEvent("event", {
      from: route.from,
      topic: route.topic,
      payload: route.payload,
    })
    const bucket = this.topicListeners.get(route.topic)
    if (bucket) for (const fn of bucket) fn(event)
    return event
  }
}
