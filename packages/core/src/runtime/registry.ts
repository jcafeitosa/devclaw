import { RuntimeNotFoundError } from "./errors.ts"
import type { ManagedRuntime } from "./types.ts"

export { RuntimeNotFoundError } from "./errors.ts"

export class RuntimeRegistry {
  private readonly runtimes = new Map<string, ManagedRuntime>()

  register(name: string, runtime: ManagedRuntime): void {
    this.runtimes.set(name, runtime)
  }

  get(name: string): ManagedRuntime {
    const rt = this.runtimes.get(name)
    if (!rt) throw new RuntimeNotFoundError(name)
    return rt
  }

  list(): string[] {
    return [...this.runtimes.keys()]
  }

  default(): ManagedRuntime {
    const first = this.runtimes.values().next()
    if (first.done) throw new RuntimeNotFoundError("<default>")
    return first.value
  }
}
