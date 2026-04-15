import { mkdir, unlink } from "node:fs/promises"
import { dirname, join, relative } from "node:path"

export type BlobKind = "s3" | "r2" | "filesystem" | "memory"

export interface BlobPutOptions {
  contentType?: string
}

export interface BlobAdapter {
  readonly kind: BlobKind
  get(key: string): Promise<ArrayBuffer | null>
  put(key: string, data: ArrayBuffer | string, opts?: BlobPutOptions): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): AsyncIterable<string>
  signedUrl?(key: string, ttlSec: number): Promise<string>
}

function toArrayBuffer(data: ArrayBuffer | string): ArrayBuffer {
  if (typeof data !== "string") return data
  return new TextEncoder().encode(data).buffer
}

export class MemoryBlobAdapter implements BlobAdapter {
  readonly kind = "memory" as const
  private readonly blobs = new Map<string, { data: ArrayBuffer; contentType?: string }>()

  async get(key: string): Promise<ArrayBuffer | null> {
    return this.blobs.get(key)?.data ?? null
  }

  async put(key: string, data: ArrayBuffer | string, opts: BlobPutOptions = {}): Promise<void> {
    this.blobs.set(key, { data: toArrayBuffer(data), contentType: opts.contentType })
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key)
  }

  async *list(prefix: string): AsyncIterable<string> {
    for (const key of [...this.blobs.keys()].sort()) {
      if (key.startsWith(prefix)) yield key
    }
  }
}

export class FilesystemBlobAdapter implements BlobAdapter {
  readonly kind = "filesystem" as const

  constructor(private readonly root: string) {}

  async get(key: string): Promise<ArrayBuffer | null> {
    const file = Bun.file(this.path(key))
    if (!(await file.exists())) return null
    return file.arrayBuffer()
  }

  async put(key: string, data: ArrayBuffer | string): Promise<void> {
    const path = this.path(key)
    await mkdir(dirname(path), { recursive: true })
    await Bun.write(path, data)
  }

  async delete(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined)
  }

  async *list(prefix: string): AsyncIterable<string> {
    const absPrefix = this.path(prefix)
    const paths: string[] = []
    for await (const path of new Bun.Glob("**/*").scan({
      cwd: this.root,
      absolute: true,
      onlyFiles: true,
    })) {
      if (!path.startsWith(absPrefix)) continue
      paths.push(relative(this.root, path))
    }
    paths.sort()
    for (const path of paths) yield path
  }

  private path(key: string): string {
    return join(this.root, key)
  }
}
