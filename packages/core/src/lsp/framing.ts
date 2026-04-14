const HEADER_TERM = "\r\n\r\n"

export function encodeLspMessage(message: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(message))
  const header = new TextEncoder().encode(`Content-Length: ${body.byteLength}${HEADER_TERM}`)
  const out = new Uint8Array(header.length + body.length)
  out.set(header, 0)
  out.set(body, header.length)
  return out
}

export type LspMessageHandler = (message: unknown) => void

export class LspMessageStream {
  private buffer = new Uint8Array(0)
  private handler?: LspMessageHandler

  onMessage(cb: LspMessageHandler): void {
    this.handler = cb
  }

  feed(chunk: Uint8Array): void {
    const merged = new Uint8Array(this.buffer.length + chunk.length)
    merged.set(this.buffer, 0)
    merged.set(chunk, this.buffer.length)
    this.buffer = merged
    this.drain()
  }

  private drain(): void {
    while (true) {
      const headerEnd = this.findHeaderEnd()
      if (headerEnd < 0) return
      const headerText = new TextDecoder().decode(this.buffer.subarray(0, headerEnd))
      const length = this.parseContentLength(headerText)
      if (length === null) {
        this.buffer = this.buffer.subarray(headerEnd + 4)
        continue
      }
      const bodyStart = headerEnd + 4
      const bodyEnd = bodyStart + length
      if (this.buffer.length < bodyEnd) return
      const body = new TextDecoder().decode(this.buffer.subarray(bodyStart, bodyEnd))
      this.buffer = this.buffer.subarray(bodyEnd)
      try {
        this.handler?.(JSON.parse(body))
      } catch {
        // swallow parse errors per LSP fault tolerance
      }
    }
  }

  private findHeaderEnd(): number {
    for (let i = 0; i + 3 < this.buffer.length; i++) {
      if (
        this.buffer[i] === 0x0d &&
        this.buffer[i + 1] === 0x0a &&
        this.buffer[i + 2] === 0x0d &&
        this.buffer[i + 3] === 0x0a
      ) {
        return i
      }
    }
    return -1
  }

  private parseContentLength(headers: string): number | null {
    for (const line of headers.split("\r\n")) {
      const m = line.match(/^Content-Length:\s*(\d+)\s*$/i)
      if (m) return Number(m[1])
    }
    return null
  }
}
