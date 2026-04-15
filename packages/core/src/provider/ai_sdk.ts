import { generateText, type LanguageModel } from "ai"

import type { GenerateOpts } from "./catalog.ts"

export async function generateWithSdk(model: LanguageModel, opts: GenerateOpts): Promise<string> {
  const { text } = await generateText({
    model,
    prompt: opts.prompt,
    system: opts.system,
    temperature: opts.temperature,
    maxOutputTokens: opts.maxTokens,
  })

  return text
}
