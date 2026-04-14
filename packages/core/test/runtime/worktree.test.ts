import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { WorktreeProvisionError } from "../../src/runtime/errors.ts"
import { WorktreeRuntime } from "../../src/runtime/worktree.ts"

interface GitCall {
  cmd: string[]
  cwd?: string
}

function mockGit(opts: { failAdd?: boolean } = {}) {
  const calls: GitCall[] = []
  const git = async (cmd: string[], o: { cwd?: string } = {}) => {
    calls.push({ cmd, cwd: o.cwd })
    if (cmd[0] === "worktree" && cmd[1] === "add") {
      if (opts.failAdd) return { exitCode: 1, stderr: "boom" }
      const dir = cmd[cmd.length - 2]
      if (dir) {
        const { mkdir } = await import("node:fs/promises")
        await mkdir(dir, { recursive: true })
      }
    }
    return { exitCode: 0, stderr: "" }
  }
  return { calls, git }
}

describe("WorktreeRuntime", () => {
  test("provisions worktree, runs inside it, cleans up", async () => {
    const { git, calls } = mockGit()
    const rt = new WorktreeRuntime({ repoRoot: "/repo", git })
    let observed = ""
    const r = await rt.run({
      command: ["pwd"],
      onCwd: (p) => {
        observed = p
      },
    })
    expect(r.stdout.trim()).toBe(observed)
    expect(observed).toMatch(/devclaw-wt-/)
    expect(existsSync(observed)).toBe(false)

    const ops = calls.map((c) => c.cmd[0]).join(",")
    expect(ops).toContain("worktree")
  })

  test("provision failure throws WorktreeProvisionError", async () => {
    const { git } = mockGit({ failAdd: true })
    const rt = new WorktreeRuntime({ repoRoot: "/repo", git })
    await expect(rt.run({ command: ["true"] })).rejects.toBeInstanceOf(WorktreeProvisionError)
  })

  test("cleans up worktree even on command failure", async () => {
    const { git } = mockGit()
    const rt = new WorktreeRuntime({ repoRoot: "/repo", git })
    let observed = ""
    const r = await rt.run({
      command: ["sh", "-c", "exit 5"],
      onCwd: (p) => {
        observed = p
      },
    })
    expect(r.exitCode).toBe(5)
    expect(existsSync(observed)).toBe(false)
  })

  test("runs against real git repo end-to-end", async () => {
    const repo = await mkdtemp(join(tmpdir(), "devclaw-wt-repo-"))
    try {
      const sh = async (cmd: string[]) => {
        const p = Bun.spawn(cmd, { cwd: repo, stdout: "pipe", stderr: "pipe" })
        await p.exited
      }
      await sh(["git", "init", "-q", "-b", "main"])
      await sh([
        "git",
        "-c",
        "user.email=t@x",
        "-c",
        "user.name=t",
        "commit",
        "--allow-empty",
        "-m",
        "init",
      ])
      await writeFile(join(repo, "marker.txt"), "hello")
      await sh(["git", "add", "."])
      await sh(["git", "-c", "user.email=t@x", "-c", "user.name=t", "commit", "-m", "add marker"])

      const rt = new WorktreeRuntime({ repoRoot: repo })
      const r = await rt.run({ command: ["cat", "marker.txt"] })
      expect(r.stdout).toBe("hello")
    } finally {
      await rm(repo, { recursive: true, force: true })
    }
  })
})
