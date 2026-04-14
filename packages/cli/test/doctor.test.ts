import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type BridgeLockEntry, loadBridgesLock, pinBridges } from "../src/commands/doctor.ts"
import { run } from "../src/index.ts"

async function makeFakeBinary(dir: string, name: string, body: string): Promise<string> {
  const path = join(dir, name)
  await writeFile(path, `#!/bin/sh\n${body}\n`, "utf8")
  await chmod(path, 0o755)
  return path
}

describe("devclaw doctor", () => {
  let home: string
  let binDir: string
  const out: string[] = []
  const err: string[] = []
  const push = (arr: string[]) => (t: string) => arr.push(t)

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "devclaw-doctor-home-"))
    binDir = await mkdtemp(join(tmpdir(), "devclaw-doctor-bin-"))
    out.length = 0
    err.length = 0
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
    await rm(binDir, { recursive: true, force: true })
  })

  test("pin writes bridges.lock with sha256 per found binary", async () => {
    await makeFakeBinary(binDir, "claude", 'echo "claude 1.0.0"')
    await makeFakeBinary(binDir, "codex", 'echo "codex 0.9.1"')

    const lock = await pinBridges({
      home,
      which: async (name) => {
        if (name === "claude") return join(binDir, "claude")
        if (name === "codex") return join(binDir, "codex")
        return null
      },
      version: async () => "stub-version",
    })

    expect(lock.entries.map((e) => e.cli).sort()).toEqual(["claude", "codex"])
    for (const entry of lock.entries) {
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(entry.path.startsWith(binDir)).toBe(true)
    }
    const raw = await readFile(join(home, "bridges.lock"), "utf8")
    const parsed = JSON.parse(raw) as { entries: BridgeLockEntry[] }
    expect(parsed.entries).toHaveLength(2)
  })

  test("loadBridgesLock returns null when file absent", async () => {
    const lock = await loadBridgesLock(home)
    expect(lock).toBeNull()
  })

  test("doctor --pin writes lock, exits 0, lists entries", async () => {
    await makeFakeBinary(binDir, "claude", 'echo "claude 1.0.0"')
    const code = await run({
      argv: ["doctor", "--pin", "--home", home, "--path", binDir],
      stdout: push(out),
      stderr: push(err),
    })
    expect(code).toBe(0)
    const text = out.join("\n")
    expect(text.toLowerCase()).toContain("pinned")
    expect(text).toContain("claude")
    const lock = await loadBridgesLock(home)
    expect(lock?.entries).toHaveLength(1)
  })

  test("doctor default checks lock, reports green when no drift", async () => {
    await makeFakeBinary(binDir, "claude", 'echo "claude 1.0.0"')
    await run({
      argv: ["doctor", "--pin", "--home", home, "--path", binDir],
      stdout: push(out),
      stderr: push(err),
    })
    out.length = 0
    err.length = 0

    const code = await run({
      argv: ["doctor", "--home", home, "--path", binDir],
      stdout: push(out),
      stderr: push(err),
    })
    expect(code).toBe(0)
    const text = out.join("\n")
    expect(text.toLowerCase()).toContain("ok")
    expect(text).toContain("claude")
  })

  test("doctor default reports drift when binary changed since pin", async () => {
    await makeFakeBinary(binDir, "claude", 'echo "claude 1.0.0"')
    await run({
      argv: ["doctor", "--pin", "--home", home, "--path", binDir],
      stdout: push(out),
      stderr: push(err),
    })
    out.length = 0
    err.length = 0

    // Rewrite the binary — SHA changes
    await makeFakeBinary(binDir, "claude", 'echo "claude 1.1.0 tampered"')

    const code = await run({
      argv: ["doctor", "--home", home, "--path", binDir],
      stdout: push(out),
      stderr: push(err),
    })
    expect(code).toBe(1)
    const text = [...out, ...err].join("\n").toLowerCase()
    expect(text).toContain("drift")
    expect(text).toContain("claude")
  })

  test("doctor default reports missing when no lock", async () => {
    const code = await run({
      argv: ["doctor", "--home", home, "--path", binDir],
      stdout: push(out),
      stderr: push(err),
    })
    expect(code).toBe(2)
    expect(err.join("\n").toLowerCase()).toContain("no bridges.lock")
  })

  test("--json emits structured result", async () => {
    await makeFakeBinary(binDir, "claude", 'echo "claude 1.0.0"')
    await run({
      argv: ["doctor", "--pin", "--home", home, "--path", binDir],
      stdout: push(out),
      stderr: push(err),
    })
    out.length = 0
    const code = await run({
      argv: ["doctor", "--home", home, "--path", binDir, "--json"],
      stdout: push(out),
      stderr: push(err),
    })
    expect(code).toBe(0)
    const parsed = JSON.parse(out.join("\n")) as {
      status: string
      entries: Array<{ cli: string; status: string }>
    }
    expect(parsed.status).toBe("ok")
    expect(parsed.entries[0]?.cli).toBe("claude")
    expect(parsed.entries[0]?.status).toBe("ok")
  })
})
