import { describe, expect, test } from "bun:test"
import { DefaultHypothesizer } from "../../src/correction/hypothesizer.ts"
import type { ErrorSignal } from "../../src/correction/types.ts"

function sig(message: string, detail?: string): ErrorSignal {
  return { id: "s", trigger: "unknown", message, detail, at: 0 }
}

describe("DefaultHypothesizer", () => {
  const h = new DefaultHypothesizer()

  test("generates multiple hypotheses for an error class", () => {
    const out = h.generate(sig("something"), "types")
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((x) => x.likelihood > 0 && x.likelihood <= 1)).toBe(true)
  })

  test("matches bumps likelihood when keywords present", () => {
    const bumped = h
      .generate(sig("foo is not defined"), "code-defect")
      .find((x) => x.suggestedFixKind === "add-import")
    const unbumped = h
      .generate(sig("random message"), "code-defect")
      .find((x) => x.suggestedFixKind === "add-import")
    expect(bumped?.likelihood).toBeGreaterThan(unbumped?.likelihood ?? 0)
  })

  test("returns empty array when class has no rules", () => {
    const out = h.generate(sig("x"), "unknown")
    expect(out).toEqual([])
  })

  test("extra rules extend defaults", () => {
    const ext = new DefaultHypothesizer({
      extraRules: [
        {
          id: "custom",
          forClasses: ["unknown"],
          description: "custom hypothesis",
          suggestedFixKind: "custom-fix",
          likelihood: 0.4,
        },
      ],
    })
    const out = ext.generate(sig("x"), "unknown")
    expect(out[0]?.suggestedFixKind).toBe("custom-fix")
  })

  test("sorted descending by likelihood", () => {
    const out = h.generate(sig("undefined property"), "runtime")
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1]?.likelihood ?? 0
      const cur = out[i]?.likelihood ?? 0
      expect(prev).toBeGreaterThanOrEqual(cur)
    }
  })
})
