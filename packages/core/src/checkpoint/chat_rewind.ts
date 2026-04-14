import { ArchiveMissingError } from "./errors.ts"
import type { ChatMessage, RewindArchive } from "./types.ts"

export interface RewindAfterOptions {
  inclusive?: boolean
  reason?: string
}

export class ChatRewind {
  private readonly messages: ChatMessage[] = []
  private readonly archives = new Map<string, RewindArchive>()

  append(message: ChatMessage): void {
    this.messages.push({ ...message })
  }

  list(): ChatMessage[] {
    return this.messages.map((m) => ({ ...m }))
  }

  rewindAfter(messageId: string, opts: RewindAfterOptions = {}): RewindArchive {
    const index = this.messages.findIndex((m) => m.id === messageId)
    if (index === -1) throw new Error(`rewind: message '${messageId}' not found`)
    const sliceFrom = opts.inclusive ? index : index + 1
    const archivedMessages = this.messages.splice(sliceFrom)
    const archiveId = `arc_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
    const archive: RewindArchive = {
      id: archiveId,
      rewindPointId: messageId,
      messages: archivedMessages,
      archivedAt: Date.now(),
    }
    this.archives.set(archiveId, archive)
    return archive
  }

  restore(archiveId: string): ChatMessage[] {
    const archive = this.archives.get(archiveId)
    if (!archive) throw new ArchiveMissingError(archiveId)
    this.messages.push(...archive.messages.map((m) => ({ ...m })))
    this.archives.delete(archiveId)
    return archive.messages
  }

  archive(id: string): RewindArchive {
    const entry = this.archives.get(id)
    if (!entry) throw new ArchiveMissingError(id)
    return { ...entry, messages: entry.messages.map((m) => ({ ...m })) }
  }

  listArchives(): RewindArchive[] {
    return [...this.archives.values()].sort((a, b) => b.archivedAt - a.archivedAt)
  }

  clear(): void {
    this.messages.length = 0
    this.archives.clear()
  }
}
