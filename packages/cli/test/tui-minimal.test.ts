import { describe, test, expect } from "bun:test"

// RED: TDD — expect the TUI package to export createTUI (module not implemented yet)
describe("D-03: TUI minimal (RED)", () => {
  test("exports createTUI function", () => {
    // This import should fail until the package is implemented (RED)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("@devclaw/tui")
    expect(typeof mod.createTUI).toBe("function")
  })
})