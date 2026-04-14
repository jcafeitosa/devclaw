export interface TerminalStartOptions {
  command: string[]
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export interface TerminalOutputEvent {
  data: string
  stream: "stdout" | "stderr"
}

export interface TerminalExitEvent {
  exitCode: number
}

export interface TerminalEvents extends Record<string, unknown> {
  output: TerminalOutputEvent
  exit: TerminalExitEvent
}

export interface TerminalSize {
  cols: number
  rows: number
}
