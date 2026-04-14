import { mkdir, readdir } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import type { Tool } from "../types.ts"

export interface FsToolConfig {
  rootDir: string
}

function resolveWithin(rootDir: string, relOrAbs: string): string {
  if (isAbsolute(relOrAbs)) {
    const rel = relative(rootDir, relOrAbs)
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`path outside rootDir: ${relOrAbs}`)
    }
    return relOrAbs
  }
  const absolute = resolve(rootDir, relOrAbs)
  const rel = relative(rootDir, absolute)
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`path outside rootDir: ${relOrAbs}`)
  }
  return absolute
}

export function makeFsReadTool(cfg: FsToolConfig): Tool<{ path: string }, { content: string }> {
  return {
    id: "fs_read",
    name: "Read file",
    description: "Read a text file relative to the project root",
    risk: "low",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    async handler({ path }) {
      const abs = resolveWithin(cfg.rootDir, path)
      const content = await Bun.file(abs).text()
      return { content }
    },
  }
}

export function makeFsWriteTool(
  cfg: FsToolConfig,
): Tool<{ path: string; content: string }, { bytes: number }> {
  return {
    id: "fs_write",
    name: "Write file",
    description: "Write a text file relative to the project root (creates parent dirs)",
    risk: "high",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    async handler({ path, content }) {
      const abs = resolveWithin(cfg.rootDir, path)
      await mkdir(dirname(abs), { recursive: true })
      const bytes = await Bun.write(abs, content)
      return { bytes }
    },
  }
}

export interface FsListEntry {
  name: string
  type: "file" | "dir" | "other"
}

export function makeFsListTool(
  cfg: FsToolConfig,
): Tool<{ path: string }, { entries: FsListEntry[] }> {
  return {
    id: "fs_list",
    name: "List directory",
    description: "List entries in a directory relative to the project root",
    risk: "low",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
    async handler({ path }) {
      const abs = resolveWithin(cfg.rootDir, path === "." ? "" : path) || cfg.rootDir
      const raw = await readdir(abs, { withFileTypes: true })
      const entries = raw.map<FsListEntry>((d) => ({
        name: d.name,
        type: d.isFile() ? "file" : d.isDirectory() ? "dir" : "other",
      }))
      return { entries }
    },
  }
}

export function _join(a: string, b: string): string {
  return join(a, b)
}
