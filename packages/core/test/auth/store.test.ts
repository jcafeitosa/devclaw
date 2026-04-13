import { describe, expect, test } from "bun:test"
import type { AuthStore } from "../../src/auth/store.ts"
import type { AuthInfo } from "../../src/auth/types.ts"

describe("AuthStore contract", () => {
  test("mock impl satisfies interface shape", async () => {
    const mem = new Map<string, AuthInfo>()
    const store: AuthStore = {
      async load(p, id = "default") {
        return mem.get(`${p}::${id}`) ?? null
      },
      async save(p, info, id = "default") {
        mem.set(`${p}::${id}`, info)
      },
      async delete(p, id = "default") {
        mem.delete(`${p}::${id}`)
      },
      async list() {
        return [...mem.entries()].map(([k, v]) => {
          const [provider, accountId] = k.split("::") as [string, string]
          return { provider, accountId, type: v.type }
        })
      },
    }
    await store.save("anthropic", { type: "api", key: "sk" })
    const loaded = await store.load("anthropic")
    expect(loaded?.type).toBe("api")
    const list = await store.list()
    expect(list).toEqual([{ provider: "anthropic", accountId: "default", type: "api" }])
    await store.delete("anthropic")
    expect(await store.load("anthropic")).toBeNull()
  })
})
