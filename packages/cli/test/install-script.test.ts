import { describe, test, expect } from "bun:test"
import fs from "fs"

// RED: expect an install script to exist at repo root
describe("D-04: install script (RED)", () => {
  test("scripts/install.sh exists", () => {
    expect(fs.existsSync("scripts/install.sh")).toBe(true)
  })
})
