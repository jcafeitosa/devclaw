import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeFsListTool, makeFsReadTool, makeFsWriteTool } from "../../src/tool/builtins/fs.ts"

describe("fs built-in tools", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "devclaw-fs-tool-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  describe("fs_read", () => {
    test("reads file content when inside rootDir", async () => {
      await writeFile(join(dir, "hello.txt"), "world")
      const tool = makeFsReadTool({ rootDir: dir })
      const { content } = await tool.handler({ path: "hello.txt" })
      expect(content).toBe("world")
    })

    test("rejects absolute path outside rootDir", async () => {
      const tool = makeFsReadTool({ rootDir: dir })
      await expect(tool.handler({ path: "/etc/passwd" })).rejects.toThrow(/outside/i)
    })

    test("rejects ../ traversal", async () => {
      const tool = makeFsReadTool({ rootDir: dir })
      await expect(tool.handler({ path: "../../etc/passwd" })).rejects.toThrow(/outside/i)
    })

    test("low risk", () => {
      expect(makeFsReadTool({ rootDir: dir }).risk).toBe("low")
    })
  })

  describe("fs_write", () => {
    test("writes file content", async () => {
      const tool = makeFsWriteTool({ rootDir: dir })
      await tool.handler({ path: "out.txt", content: "hello" })
      const got = await Bun.file(join(dir, "out.txt")).text()
      expect(got).toBe("hello")
    })

    test("creates parent dirs when missing", async () => {
      const tool = makeFsWriteTool({ rootDir: dir })
      await tool.handler({ path: "sub/nested/out.txt", content: "x" })
      const got = await Bun.file(join(dir, "sub/nested/out.txt")).text()
      expect(got).toBe("x")
    })

    test("rejects path outside rootDir", async () => {
      const tool = makeFsWriteTool({ rootDir: dir })
      await expect(tool.handler({ path: "../escape.txt", content: "bad" })).rejects.toThrow(
        /outside/i,
      )
    })

    test("high risk (writes are gated)", () => {
      expect(makeFsWriteTool({ rootDir: dir }).risk).toBe("high")
    })
  })

  describe("fs_list", () => {
    test("lists files + dirs in subdir", async () => {
      await mkdir(join(dir, "sub"))
      await writeFile(join(dir, "sub/a.txt"), "")
      await writeFile(join(dir, "sub/b.txt"), "")
      const tool = makeFsListTool({ rootDir: dir })
      const { entries } = await tool.handler({ path: "sub" })
      const names = entries.map((e) => e.name).sort()
      expect(names).toEqual(["a.txt", "b.txt"])
      expect(entries.every((e) => e.type === "file")).toBe(true)
    })

    test("distinguishes files and directories", async () => {
      await mkdir(join(dir, "d1"))
      await writeFile(join(dir, "f1.txt"), "")
      const tool = makeFsListTool({ rootDir: dir })
      const { entries } = await tool.handler({ path: "." })
      const d1 = entries.find((e) => e.name === "d1")
      const f1 = entries.find((e) => e.name === "f1.txt")
      expect(d1?.type).toBe("dir")
      expect(f1?.type).toBe("file")
    })
  })
})
