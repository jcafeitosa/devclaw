export type Listener<T> = (payload: T) => void

export class EventEmitter<EventMap extends Record<string, unknown>> {
  private listeners = new Map<keyof EventMap, Set<Listener<unknown>>>()

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener as Listener<unknown>)
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>)
  }

  once<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const wrap: Listener<EventMap[K]> = (p) => {
      this.off(event, wrap)
      listener(p)
    }
    this.on(event, wrap)
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of [...set]) {
      try {
        ;(listener as Listener<EventMap[K]>)(payload)
      } catch {
        // isolate listener failures
      }
    }
  }

  removeAll(event?: keyof EventMap): void {
    if (event === undefined) this.listeners.clear()
    else this.listeners.delete(event)
  }
}
