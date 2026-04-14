import { AccessDeniedError, NotFoundError } from "./errors.ts"
import type { AccessPolicy, Channel, ChannelType, CommMessage } from "./types.ts"

function canRead(channel: Channel, actor: string): boolean {
  if (channel.policy.publicRead) return true
  if (channel.members.includes(actor)) return true
  return channel.policy.readers?.includes(actor) ?? false
}

function canWrite(channel: Channel, actor: string): boolean {
  if (channel.policy.publicWrite) return true
  if (channel.members.includes(actor)) return true
  return channel.policy.writers?.includes(actor) ?? false
}

export interface CreateChannelInput {
  id?: string
  name: string
  type: ChannelType
  topic?: string
  projectId?: string
  taskId?: string
  members?: string[]
  policy?: AccessPolicy
}

export class ChannelRegistry {
  private readonly channels = new Map<string, Channel>()
  private readonly messages = new Map<string, CommMessage[]>()
  private readonly subscribers = new Map<string, Set<(msg: CommMessage) => void>>()

  create(input: CreateChannelInput): Channel {
    const id = input.id ?? `ch_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    const channel: Channel = {
      id,
      name: input.name,
      type: input.type,
      topic: input.topic,
      projectId: input.projectId,
      taskId: input.taskId,
      members: input.members ?? [],
      policy: input.policy ?? {},
      createdAt: Date.now(),
    }
    this.channels.set(id, channel)
    this.messages.set(id, [])
    return channel
  }

  get(id: string): Channel {
    const c = this.channels.get(id)
    if (!c) throw new NotFoundError("channel", id)
    return c
  }

  list(): Channel[] {
    return [...this.channels.values()]
  }

  join(channelId: string, actor: string): Channel {
    const channel = this.get(channelId)
    if (!channel.members.includes(actor)) channel.members.push(actor)
    return channel
  }

  leave(channelId: string, actor: string): Channel {
    const channel = this.get(channelId)
    channel.members = channel.members.filter((m) => m !== actor)
    return channel
  }

  post(channelId: string, from: string, content: string, threadId?: string): CommMessage {
    const channel = this.get(channelId)
    if (!canWrite(channel, from)) {
      throw new AccessDeniedError(from, channelId, "post")
    }
    const msg: CommMessage = {
      id: `msg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      channelId,
      threadId,
      from,
      content,
      at: Date.now(),
    }
    this.messages.get(channelId)?.push(msg)
    const subs = this.subscribers.get(channelId)
    if (subs) for (const fn of subs) fn({ ...msg })
    return msg
  }

  list_messages(channelId: string, reader: string): CommMessage[] {
    const channel = this.get(channelId)
    if (!canRead(channel, reader)) {
      throw new AccessDeniedError(reader, channelId, "read")
    }
    return (this.messages.get(channelId) ?? []).map((m) => ({ ...m }))
  }

  subscribe(channelId: string, reader: string, handler: (msg: CommMessage) => void): () => void {
    const channel = this.get(channelId)
    if (!canRead(channel, reader)) {
      throw new AccessDeniedError(reader, channelId, "subscribe")
    }
    let bucket = this.subscribers.get(channelId)
    if (!bucket) {
      bucket = new Set()
      this.subscribers.set(channelId, bucket)
    }
    bucket.add(handler)
    return () => {
      bucket?.delete(handler)
    }
  }
}
