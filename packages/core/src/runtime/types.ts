export interface RuntimeSpec {
  command: string[]
  cwd?: string
  env?: Record<string, string>
  inheritEnv?: boolean
  stdin?: string
  timeoutMs?: number
  onCwd?: (cwd: string) => void
}

export interface RuntimeResult {
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  cwd: string
}

export interface ManagedRuntime {
  readonly kind: string
  run(spec: RuntimeSpec): Promise<RuntimeResult>
}
