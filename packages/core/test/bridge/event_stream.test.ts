import { describe, expect, test } from "bun:test"
import { parseJsonlEvents, parseTextEvents } from "../../src/bridge/event_stream.ts"
import type { BridgeEvent } from "../../src/bridge/types.ts"

async function* lines(xs: string[]): AsyncGenerator<string> {
  for (const x of xs) yield x
}

async function collect(iter: AsyncIterable<BridgeEvent>): Promise<BridgeEvent[]> {
  const out: BridgeEvent[] = []
  for await (const ev of iter) out.push(ev)
  return out
}

describe("parseJsonlEvents", () => {
  test("parses known event shapes", async () => {
    const events = await collect(
      parseJsonlEvents(
        lines([
          JSON.stringify({ type: "started", at: 1 }),
          JSON.stringify({ type: "thought", content: "hmm" }),
          JSON.stringify({ type: "tool_call", tool: "fs_read", args: { path: "x" } }),
          JSON.stringify({ type: "completed", summary: "done" }),
        ]),
        "claude",
      ),
    )
    expect(events).toHaveLength(4)
    expect(events[0]?.type).toBe("started")
    expect(events[2]?.type).toBe("tool_call")
  })

  test("skips blank lines", async () => {
    const events = await collect(
      parseJsonlEvents(lines(["", JSON.stringify({ type: "text", content: "hi" }), ""]), "claude"),
    )
    expect(events).toHaveLength(1)
  })

  test("emits error event on malformed JSON (does not throw)", async () => {
    const events = await collect(parseJsonlEvents(lines(["not json"]), "claude"))
    expect(events.some((e) => e.type === "error")).toBe(true)
  })

  test("filters unknown event types into log events", async () => {
    const events = await collect(
      parseJsonlEvents(lines([JSON.stringify({ type: "mystery", content: "?" })]), "claude"),
    )
    expect(events[0]?.type).toBe("log")
  })
})

describe("parseTextEvents", () => {
  test("each line → text event", async () => {
    const events = await collect(parseTextEvents(lines(["a", "b", "c"])))
    expect(events.map((e) => (e.type === "text" ? e.content : null))).toEqual(["a", "b", "c"])
  })

  test("empty lines skipped", async () => {
    const events = await collect(parseTextEvents(lines(["", "x", ""])))
    expect(events).toHaveLength(1)
  })
})
