import { describe, expect, test } from "bun:test"
import { AsyncMutex, KeyedAsyncMutex } from "../../src/util/async_mutex.ts"

describe("AsyncMutex", () => {
  test("serializes concurrent holders", async () => {
    const mu = new AsyncMutex()
    const order: string[] = []
    const task = async (label: string, delay: number) => {
      await mu.with(async () => {
        order.push(`${label}-start`)
        await Bun.sleep(delay)
        order.push(`${label}-end`)
      })
    }
    await Promise.all([task("a", 30), task("b", 10)])
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"])
  })

  test("releases lock on throw", async () => {
    const mu = new AsyncMutex()
    await expect(
      mu.with(async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")
    let ran = false
    await mu.with(async () => {
      ran = true
    })
    expect(ran).toBe(true)
  })
})

describe("KeyedAsyncMutex", () => {
  test("different keys run in parallel; same key serializes", async () => {
    const mu = new KeyedAsyncMutex()
    let peakSame = 0
    let inSame = 0
    let peakDiff = 0
    let inDiff = 0

    const runSame = async () => {
      await mu.with("k", async () => {
        inSame++
        peakSame = Math.max(peakSame, inSame)
        await Bun.sleep(15)
        inSame--
      })
    }
    const runDiff = async (k: string) => {
      await mu.with(k, async () => {
        inDiff++
        peakDiff = Math.max(peakDiff, inDiff)
        await Bun.sleep(15)
        inDiff--
      })
    }

    await Promise.all([runSame(), runSame(), runDiff("a"), runDiff("b")])
    expect(peakSame).toBe(1)
    expect(peakDiff).toBeGreaterThanOrEqual(2)
  })
})
