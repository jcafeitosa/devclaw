export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve()

  async with<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail
    let release!: () => void
    this.tail = new Promise<void>((res) => {
      release = res
    })
    await prev
    try {
      return await fn()
    } finally {
      release()
    }
  }
}

export class KeyedAsyncMutex {
  private locks = new Map<string, AsyncMutex>()

  async with<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let mu = this.locks.get(key)
    if (!mu) {
      mu = new AsyncMutex()
      this.locks.set(key, mu)
    }
    return mu.with(fn)
  }
}
