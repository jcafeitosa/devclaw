import type { IsolationMode } from "../subagent/types.ts"
import type { RoleId } from "../team/types.ts"

export type ArgType = "string" | "number" | "boolean"

export interface ArgSpec {
  name: string
  type: ArgType
  required?: boolean
  default?: string | number | boolean
  describe?: string
}

export interface SlashDefinition {
  name: string
  description?: string
  body: string
  agents?: RoleId[]
  tools?: string[]
  disallowedTools?: string[]
  model?: string
  maxTurns?: number
  isolation?: IsolationMode
  permissionMode?: string
  budgetUsd?: number
  timeoutMinutes?: number
  args?: ArgSpec[]
  version?: string
  source?: string
  hooks?: { pre?: string; post?: string }
}

export interface CommandInvocation {
  name: string
  positional: string[]
  flags: Record<string, string | number | boolean>
}
