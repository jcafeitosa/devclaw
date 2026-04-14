import { describe, expect, test } from "bun:test"
import { EventEmitter } from "../../src/util/event_emitter.ts"

type Events = {
  hello: { name: string }
  count: number
}

describe("EventEmitter", () => {
  test("emit delivers to all on listeners", () => {
    const ee = new EventEmitter<Events>()
    const received: string[] = []
    ee.on("hello", (p) => received.push(`a:${p.name}`))
    ee.on("hello", (p) => received.push(`b:${p.name}`))
    ee.emit("hello", { name: "world" })
    expect(received).toEqual(["a:world", "b:world"])
  })

  test("off removes specific listener", () => {
    const ee = new EventEmitter<Events>()
    let count = 0
    const listener = () => {
      count++
    }
    ee.on("count", listener)
    ee.emit("count", 1)
    ee.off("count", listener)
    ee.emit("count", 2)
    expect(count).toBe(1)
  })

  test("once fires exactly one time", () => {
    const ee = new EventEmitter<Events>()
    let count = 0
    ee.once("hello", () => {
      count++
    })
    ee.emit("hello", { name: "a" })
    ee.emit("hello", { name: "b" })
    expect(count).toBe(1)
  })

  test("different event names are independent", () => {
    const ee = new EventEmitter<Events>()
    let hellos = 0
    let counts = 0
    ee.on("hello", () => {
      hellos++
    })
    ee.on("count", () => {
      counts++
    })
    ee.emit("count", 1)
    expect(hellos).toBe(0)
    expect(counts).toBe(1)
  })

  test("throwing listener does not prevent other listeners", () => {
    const ee = new EventEmitter<Events>()
    let b = 0
    ee.on("count", () => {
      throw new Error("a")
    })
    ee.on("count", () => {
      b++
    })
    ee.emit("count", 1)
    expect(b).toBe(1)
  })
})
