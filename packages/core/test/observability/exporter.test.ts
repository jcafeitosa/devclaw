import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ConsoleExporter,
  JsonFileExporter,
  MultiExporter,
  RatioSampler,
} from "../../src/observability/exporter.ts"
import type { TelemetryEvent } from "../../src/observability/types.ts"

function logEvent(): TelemetryEvent {
  return {
    kind: "log",
    record: { at: 1, level: "info", message: "hi", attrs: { x: 1 } },
  }
}

describe("ConsoleExporter", () => {
  test("calls writer with formatted JSON line", () => {
    const lines: string[] = []
    const exp = new ConsoleExporter({
      writer: (s) => {
        lines.push(s)
      },
    })
    exp.export(logEvent())
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0]!)
    expect(parsed.kind).toBe("log")
    expect(parsed.record.message).toBe("hi")
  })
})

describe("JsonFileExporter", () => {
  test("appends newline-delimited JSON to file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "devclaw-obs-"))
    const path = join(dir, "events.jsonl")
    try {
      const exp = new JsonFileExporter({ path })
      await exp.export(logEvent())
      await exp.export(logEvent())
      await exp.flush()
      const text = await readFile(path, "utf8")
      const lines = text.trim().split("\n")
      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]!).kind).toBe("log")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("MultiExporter", () => {
  test("fans out events to every child exporter", async () => {
    const seen1: TelemetryEvent[] = []
    const seen2: TelemetryEvent[] = []
    const m = new MultiExporter([
      {
        export: (e) => {
          seen1.push(e)
        },
      },
      {
        export: (e) => {
          seen2.push(e)
        },
      },
    ])
    await m.export(logEvent())
    expect(seen1).toHaveLength(1)
    expect(seen2).toHaveLength(1)
  })
})

describe("RatioSampler", () => {
  test("ratio=1 always samples", () => {
    const s = new RatioSampler(1)
    for (let i = 0; i < 10; i++) expect(s.shouldSample()).toBe(true)
  })

  test("ratio=0 never samples", () => {
    const s = new RatioSampler(0)
    for (let i = 0; i < 10; i++) expect(s.shouldSample()).toBe(false)
  })

  test("ratio in (0,1) gates correctly via injected rng", () => {
    const values = [0.1, 0.6, 0.9]
    let i = 0
    const s = new RatioSampler(0.5, () => values[i++ % values.length]!)
    expect(s.shouldSample()).toBe(true)
    expect(s.shouldSample()).toBe(false)
    expect(s.shouldSample()).toBe(false)
  })
})
