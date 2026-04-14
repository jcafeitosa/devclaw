import { describe, expect, test } from "bun:test"
import { PermissionChecker } from "../../src/tool/permission.ts"
import type { Tool } from "../../src/tool/types.ts"

function tool(id: string, risk: Tool["risk"]): Tool {
  return {
    id,
    name: id,
    description: "x",
    risk,
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return null
    },
  }
}

describe("PermissionChecker", () => {
  test("default allow low-risk", async () => {
    const p = new PermissionChecker({})
    const d = await p.check(tool("fs_read", "low"), {}, { agentId: "a" })
    expect(d).toBe("allow")
  })

  test("default allow medium-risk", async () => {
    const p = new PermissionChecker({})
    const d = await p.check(tool("fs_list", "medium"), {}, { agentId: "a" })
    expect(d).toBe("allow")
  })

  test("default deny high-risk when no approver", async () => {
    const p = new PermissionChecker({})
    const d = await p.check(tool("fs_write", "high"), {}, { agentId: "a" })
    expect(d).toBe("deny")
  })

  test("high-risk calls approver when provided", async () => {
    const captured = { id: null as string | null }
    const p = new PermissionChecker({
      approve: async (ctx) => {
        captured.id = ctx.tool.id
        return "allow"
      },
    })
    const d = await p.check(tool("fs_write", "high"), { path: "/x" }, { agentId: "a" })
    expect(d).toBe("allow")
    expect(captured.id).toBe("fs_write")
  })

  test("critical always requires approval (even with allowlist)", async () => {
    const p = new PermissionChecker({
      allow: ["*"],
    })
    const d = await p.check(tool("shell_exec", "critical"), {}, { agentId: "a" })
    expect(d).toBe("deny")
  })

  test("deny list blocks even low-risk", async () => {
    const p = new PermissionChecker({ deny: ["fs_read"] })
    const d = await p.check(tool("fs_read", "low"), {}, { agentId: "a" })
    expect(d).toBe("deny")
  })

  test("allow list auto-approves high (but not critical)", async () => {
    const p = new PermissionChecker({ allow: ["fs_write"] })
    expect(await p.check(tool("fs_write", "high"), {}, { agentId: "a" })).toBe("allow")
    expect(await p.check(tool("fs_write", "critical"), {}, { agentId: "a" })).toBe("deny")
  })

  test("allow list '*' wildcard covers high-risk tools", async () => {
    const p = new PermissionChecker({ allow: ["*"] })
    expect(await p.check(tool("anything", "high"), {}, { agentId: "a" })).toBe("allow")
  })

  test("approver denying yields deny", async () => {
    const p = new PermissionChecker({
      approve: async () => "deny",
    })
    expect(await p.check(tool("fs_write", "high"), {}, { agentId: "a" })).toBe("deny")
  })
})
