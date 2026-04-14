import type { CollaborationMode, Interaction, RoleId } from "./types.ts"

export interface InteractionInput {
  from: RoleId
  to: RoleId | RoleId[]
  topic: string
  payload?: unknown
  at?: number
}

function make(mode: CollaborationMode, input: InteractionInput): Interaction {
  return {
    mode,
    from: input.from,
    to: input.to,
    topic: input.topic,
    payload: input.payload,
    at: input.at ?? Date.now(),
  }
}

export function debate(input: InteractionInput): Interaction {
  return make("debate", input)
}
export function collab(input: InteractionInput): Interaction {
  return make("collab", input)
}
export function cooperate(input: InteractionInput): Interaction {
  return make("cooperate", input)
}
export function delegate(input: InteractionInput): Interaction {
  return make("delegate", input)
}

export const MODE_FOR_PHASE: Record<string, CollaborationMode> = {
  "design-doc": "debate",
  "design-review": "debate",
  planning: "delegate",
  development: "collab",
  "code-review": "collab",
  testing: "cooperate",
  deploy: "cooperate",
  incident: "cooperate",
  postmortem: "debate",
}

export function modeForPhase(phase: string): CollaborationMode {
  return MODE_FOR_PHASE[phase] ?? "collab"
}
