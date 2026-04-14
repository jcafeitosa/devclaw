import { describe, expect, test } from "bun:test"

import type { CliId } from "../../src/bridge/types.ts"
import { makeLLMJudgeScorer } from "../../src/consensus/index.ts"
import {
  type GenerateOpts,
  type GenerateResult,
  ProviderCatalog,
  type ProviderDescriptor,
} from "../../src/provider/catalog.ts"

function stubProvider(impl: (opts: GenerateOpts) => Promise<string>): ProviderDescriptor {
  return {
    id: "judge",
    name: "Judge",
    baseUrl: "",
    defaultModel: "judge-1",
    async generate(opts) {
      return impl(opts)
    },
  }
}

async function score(
  scorer: ReturnType<typeof makeLLMJudgeScorer>,
  cli: CliId,
  text: string,
): Promise<number> {
  return scorer(cli, text, {
    cli,
    text,
    events: [],
    durationMs: 0,
  })
}

describe("makeLLMJudgeScorer", () => {
  test("parses numeric response into score 0..1", async () => {
    const catalog = new ProviderCatalog()
    catalog.register(stubProvider(async () => "0.78"))
    const scorer = makeLLMJudgeScorer({
      catalog,
      providerId: "judge",
      prompt: "rate this response",
    })
    expect(await score(scorer, "claude", "hello")).toBeCloseTo(0.78, 2)
  })

  test("clamps scores above 1 to 1", async () => {
    const catalog = new ProviderCatalog()
    catalog.register(stubProvider(async () => "5"))
    const scorer = makeLLMJudgeScorer({ catalog, providerId: "judge" })
    expect(await score(scorer, "codex", "anything")).toBe(1)
  })

  test("clamps negative values to 0", async () => {
    const catalog = new ProviderCatalog()
    catalog.register(stubProvider(async () => "-3"))
    const scorer = makeLLMJudgeScorer({ catalog, providerId: "judge" })
    expect(await score(scorer, "gemini", "x")).toBe(0)
  })

  test("non-numeric response becomes 0", async () => {
    const catalog = new ProviderCatalog()
    catalog.register(stubProvider(async () => "I like this a lot"))
    const scorer = makeLLMJudgeScorer({ catalog, providerId: "judge" })
    expect(await score(scorer, "claude", "x")).toBe(0)
  })

  test("empty response text gets score 0 without calling judge", async () => {
    let called = false
    const catalog = new ProviderCatalog()
    catalog.register(
      stubProvider(async () => {
        called = true
        return "1"
      }),
    )
    const scorer = makeLLMJudgeScorer({ catalog, providerId: "judge" })
    expect(await score(scorer, "claude", "")).toBe(0)
    expect(called).toBe(false)
  })

  test("prompt template supports {{cli}} + {{text}} + {{goal}}", async () => {
    let seen = ""
    const catalog = new ProviderCatalog()
    catalog.register(
      stubProvider(async (opts) => {
        seen = opts.prompt
        return "0.5"
      }),
    )
    const scorer = makeLLMJudgeScorer({
      catalog,
      providerId: "judge",
      goal: "design a payment flow",
      prompt: "CLI={{cli}}\nGOAL={{goal}}\nTEXT={{text}}\nScore:",
    })
    await score(scorer, "codex", "here is the design")
    expect(seen).toContain("CLI=codex")
    expect(seen).toContain("GOAL=design a payment flow")
    expect(seen).toContain("TEXT=here is the design")
  })

  test("respects custom model + maxTokens via options", async () => {
    let capturedOpts: GenerateOpts | null = null
    const catalog = new ProviderCatalog()
    catalog.register({
      id: "judge",
      name: "Judge",
      baseUrl: "",
      defaultModel: "default",
      async generate(opts) {
        capturedOpts = opts
        return "0.5"
      },
    })
    const scorer = makeLLMJudgeScorer({
      catalog,
      providerId: "judge",
      model: "judge-pro",
      maxTokens: 8,
    })
    await score(scorer, "claude", "x")
    expect(capturedOpts).not.toBeNull()
    const opts = capturedOpts as unknown as GenerateOpts
    expect(opts.model).toBe("judge-pro")
    expect(opts.maxTokens).toBe(8)
  })
})
