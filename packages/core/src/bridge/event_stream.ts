import type { BridgeEvent } from "./types.ts"

const KNOWN_TYPES = new Set<BridgeEvent["type"]>([
  "started",
  "thought",
  "tool_call",
  "tool_result",
  "text",
  "file_change",
  "commit",
  "log",
  "completed",
  "error",
])

function normalizeKnown(obj: Record<string, unknown>): BridgeEvent | null {
  const type = obj.type
  if (typeof type !== "string" || !KNOWN_TYPES.has(type as BridgeEvent["type"])) return null
  return obj as unknown as BridgeEvent
}

export async function* parseJsonlEvents(
  lines: AsyncIterable<string>,
  cli: string,
): AsyncGenerator<BridgeEvent> {
  for await (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch (err) {
      yield {
        type: "error",
        message: `bridge ${cli}: invalid JSONL: ${
          err instanceof Error ? err.message : String(err)
        } [${line.slice(0, 80)}]`,
      }
      continue
    }
    if (!parsed || typeof parsed !== "object") {
      yield { type: "log", level: "warn", message: `bridge ${cli}: unknown line: ${line}` }
      continue
    }
    const normalized = normalizeKnown(parsed as Record<string, unknown>)
    if (normalized) {
      yield normalized
    } else {
      yield { type: "log", level: "info", message: line }
    }
  }
}

export async function* parseTextEvents(lines: AsyncIterable<string>): AsyncGenerator<BridgeEvent> {
  for await (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    yield { type: "text", content: line }
  }
}
