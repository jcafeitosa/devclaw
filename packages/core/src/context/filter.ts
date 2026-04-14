import type { ContextItem } from "./types.ts"

export function applyThresholdFilter(items: ContextItem[], threshold: number): ContextItem[] {
  return items.filter((i) => (i.score ?? 0) >= threshold)
}
