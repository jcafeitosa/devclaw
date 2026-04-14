export interface RateCard {
  provider: string
  model: string
  inputPerMillion: number
  outputPerMillion: number
  currency?: string
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
}

export function computeUsdCost(card: RateCard, usage: TokenUsage): number {
  const inputUsd = (usage.input_tokens / 1_000_000) * card.inputPerMillion
  const outputUsd = (usage.output_tokens / 1_000_000) * card.outputPerMillion
  return inputUsd + outputUsd
}

function key(provider: string, model: string): string {
  return `${provider}/${model}`
}

export class RateCardRegistry {
  private readonly cards = new Map<string, RateCard>()

  register(card: RateCard): void {
    this.cards.set(key(card.provider, card.model), { ...card })
  }

  get(provider: string, model: string): RateCard {
    const c = this.cards.get(key(provider, model))
    if (!c) throw new Error(`no rate card for ${provider}/${model}`)
    return c
  }

  has(provider: string, model: string): boolean {
    return this.cards.has(key(provider, model))
  }

  listProviders(): string[] {
    return Array.from(new Set([...this.cards.values()].map((c) => c.provider)))
  }

  listModels(provider: string): string[] {
    return [...this.cards.values()].filter((c) => c.provider === provider).map((c) => c.model)
  }
}
