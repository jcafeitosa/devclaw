import { describe, expect, test } from "bun:test"
import type { RiskLevel, Tool, ToolSchema } from "../../src/tool/types.ts"

describe("Tool types (compile-only)", () => {
  test("Tool<I,O> accepts typed handler + schema", () => {
    interface In {
      path: string
    }
    interface Out {
      content: string
    }
    const schema: ToolSchema<In> = {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    }
    const tool: Tool<In, Out> = {
      id: "fs_read",
      name: "Read file",
      description: "Reads a file",
      risk: "medium",
      inputSchema: schema,
      async handler({ path }) {
        return { content: `read:${path}` }
      },
    }
    expect(tool.id).toBe("fs_read")
  })

  test("RiskLevel enum covers 4 levels", () => {
    const all: RiskLevel[] = ["low", "medium", "high", "critical"]
    expect(all).toHaveLength(4)
  })
})
