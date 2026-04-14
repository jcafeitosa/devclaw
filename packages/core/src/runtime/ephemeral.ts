import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LocalRuntime } from "./local.ts"
import type { ManagedRuntime, RuntimeResult, RuntimeSpec } from "./types.ts"

export class EphemeralRuntime implements ManagedRuntime {
  readonly kind = "ephemeral"
  private readonly local = new LocalRuntime()

  async run(spec: RuntimeSpec): Promise<RuntimeResult> {
    const raw = await mkdtemp(join(tmpdir(), "devclaw-rt-"))
    const dir = await realpath(raw)
    try {
      return await this.local.run({ ...spec, cwd: dir })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}
