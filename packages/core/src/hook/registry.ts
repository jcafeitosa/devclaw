import type { HookDefinition, HookType } from "./types.ts"

interface StoredHook<P> {
  def: HookDefinition<P>
  insertOrder: number
}

export class HookRegistry {
  private readonly byType = new Map<HookType, StoredHook<unknown>[]>()
  private readonly byName = new Map<string, StoredHook<unknown>>()
  private insertCounter = 0

  register<P>(def: HookDefinition<P>): void {
    if (this.byName.has(def.name)) {
      throw new Error(`hook '${def.name}' already registered`)
    }
    const entry: StoredHook<unknown> = {
      def: { ...def, enabled: def.enabled ?? true } as HookDefinition<unknown>,
      insertOrder: this.insertCounter++,
    }
    this.byName.set(def.name, entry)
    const bucket = this.byType.get(def.type) ?? []
    bucket.push(entry)
    bucket.sort(
      (a, b) => (a.def.priority ?? 0) - (b.def.priority ?? 0) || a.insertOrder - b.insertOrder,
    )
    this.byType.set(def.type, bucket)
  }

  unregister(name: string): void {
    const entry = this.byName.get(name)
    if (!entry) return
    this.byName.delete(name)
    const bucket = this.byType.get(entry.def.type)
    if (!bucket) return
    const idx = bucket.indexOf(entry)
    if (idx >= 0) bucket.splice(idx, 1)
  }

  enable(name: string): void {
    const entry = this.byName.get(name)
    if (entry) entry.def.enabled = true
  }

  disable(name: string): void {
    const entry = this.byName.get(name)
    if (entry) entry.def.enabled = false
  }

  get(name: string): HookDefinition | undefined {
    return this.byName.get(name)?.def
  }

  list(): HookDefinition[] {
    return [...this.byName.values()].map((s) => s.def)
  }

  forType(type: HookType): HookDefinition[] {
    return (this.byType.get(type) ?? []).filter((s) => s.def.enabled !== false).map((s) => s.def)
  }
}
