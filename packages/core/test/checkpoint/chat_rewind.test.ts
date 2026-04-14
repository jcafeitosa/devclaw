import { describe, expect, test } from "bun:test"
import { ChatRewind } from "../../src/checkpoint/chat_rewind.ts"
import { ArchiveMissingError } from "../../src/checkpoint/errors.ts"
import type { ChatMessage } from "../../src/checkpoint/types.ts"

function msg(id: string, content: string, at = Date.now()): ChatMessage {
  return { id, role: "user", content, at }
}

describe("ChatRewind", () => {
  test("append + list", () => {
    const r = new ChatRewind()
    r.append(msg("m1", "hi"))
    r.append(msg("m2", "there"))
    expect(r.list().map((m) => m.id)).toEqual(["m1", "m2"])
  })

  test("rewindAfter archives messages strictly after (default exclusive)", () => {
    const r = new ChatRewind()
    r.append(msg("a", ""))
    r.append(msg("b", ""))
    r.append(msg("c", ""))
    const archive = r.rewindAfter("a")
    expect(r.list().map((m) => m.id)).toEqual(["a"])
    expect(archive.messages.map((m) => m.id)).toEqual(["b", "c"])
  })

  test("rewindAfter inclusive archives target too", () => {
    const r = new ChatRewind()
    r.append(msg("a", ""))
    r.append(msg("b", ""))
    r.rewindAfter("a", { inclusive: true })
    expect(r.list()).toEqual([])
  })

  test("restore returns archived messages and removes archive", () => {
    const r = new ChatRewind()
    r.append(msg("a", ""))
    r.append(msg("b", ""))
    const archive = r.rewindAfter("a")
    const restored = r.restore(archive.id)
    expect(restored.map((m) => m.id)).toEqual(["b"])
    expect(r.list().map((m) => m.id)).toEqual(["a", "b"])
    expect(r.listArchives()).toEqual([])
  })

  test("restore unknown archive throws", () => {
    const r = new ChatRewind()
    expect(() => r.restore("missing")).toThrow(ArchiveMissingError)
  })

  test("listArchives sorted desc by archivedAt", async () => {
    const r = new ChatRewind()
    r.append(msg("a", ""))
    r.append(msg("b", ""))
    const first = r.rewindAfter("a")
    r.append(msg("c", ""))
    await Bun.sleep(2)
    const second = r.rewindAfter("a")
    const ids = r.listArchives().map((a) => a.id)
    expect(ids[0]).toBe(second.id)
    expect(ids[1]).toBe(first.id)
  })

  test("rewindAfter unknown message throws", () => {
    const r = new ChatRewind()
    expect(() => r.rewindAfter("missing")).toThrow(/not found/i)
  })
})
