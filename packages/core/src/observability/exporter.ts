import { appendFile } from "node:fs/promises"
import type { Sampler, TelemetryEvent, TelemetryExporter } from "./types.ts"

export interface ConsoleExporterConfig {
  writer?: (line: string) => void
}

export class ConsoleExporter implements TelemetryExporter {
  private readonly writer: (line: string) => void

  constructor(cfg: ConsoleExporterConfig = {}) {
    this.writer = cfg.writer ?? ((s) => console.log(s))
  }

  export(event: TelemetryEvent): void {
    this.writer(JSON.stringify(event))
  }
}

export interface JsonFileExporterConfig {
  path: string
}

export class JsonFileExporter implements TelemetryExporter {
  private readonly path: string
  private buffer: string[] = []

  constructor(cfg: JsonFileExporterConfig) {
    this.path = cfg.path
  }

  async export(event: TelemetryEvent): Promise<void> {
    this.buffer.push(`${JSON.stringify(event)}\n`)
    if (this.buffer.length >= 100) await this.flush()
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return
    const data = this.buffer.join("")
    this.buffer = []
    await appendFile(this.path, data, "utf8")
  }
}

export class MultiExporter implements TelemetryExporter {
  constructor(private readonly children: TelemetryExporter[]) {}

  async export(event: TelemetryEvent): Promise<void> {
    await Promise.all(this.children.map((c) => Promise.resolve(c.export(event))))
  }

  async flush(): Promise<void> {
    await Promise.all(this.children.map((c) => Promise.resolve(c.flush?.())))
  }
}

export class AlwaysSampler implements Sampler {
  shouldSample(): boolean {
    return true
  }
}

export class NeverSampler implements Sampler {
  shouldSample(): boolean {
    return false
  }
}

export class RatioSampler implements Sampler {
  constructor(
    private readonly ratio: number,
    private readonly rng: () => number = Math.random,
  ) {}

  shouldSample(): boolean {
    if (this.ratio >= 1) return true
    if (this.ratio <= 0) return false
    return this.rng() < this.ratio
  }
}
