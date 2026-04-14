import { describe, expect, test } from "bun:test"
import { openBrowser, resolveOpenCommand } from "../../src/oauth/browser.ts"
import { OAuthBrowserUnavailableError } from "../../src/oauth/errors.ts"

describe("resolveOpenCommand", () => {
  test("darwin → open", () => {
    expect(resolveOpenCommand("darwin")).toEqual(["open"])
  })

  test("linux → xdg-open", () => {
    expect(resolveOpenCommand("linux")).toEqual(["xdg-open"])
  })

  test("win32 → start with shell args", () => {
    expect(resolveOpenCommand("win32")).toEqual(["cmd", "/c", "start", ""])
  })

  test("unknown platform → throws", () => {
    expect(() => resolveOpenCommand("plan9")).toThrow(/unsupported/)
  })
})

describe("openBrowser", () => {
  test("prints URL when headless (no tty)", async () => {
    let printed = ""
    await openBrowser({
      url: "https://example.test/authorize",
      platform: "darwin",
      isTTY: false,
      printer: (s) => {
        printed = s
      },
      spawner: () => {
        throw new Error("should not spawn")
      },
    })
    expect(printed).toContain("https://example.test/authorize")
  })

  test("spawns open command when tty available", async () => {
    const spawned: string[] = []
    await openBrowser({
      url: "https://example.test/x",
      platform: "darwin",
      isTTY: true,
      printer: () => {},
      spawner: (cmd) => {
        spawned.push(...cmd)
      },
    })
    expect(spawned).toEqual(["open", "https://example.test/x"])
  })

  test("throws BrowserUnavailable when spawn errors with tty", async () => {
    await expect(
      openBrowser({
        url: "https://x/y",
        platform: "linux",
        isTTY: true,
        printer: () => {},
        spawner: () => {
          throw new Error("ENOENT")
        },
      }),
    ).rejects.toBeInstanceOf(OAuthBrowserUnavailableError)
  })
})
