export type ModerationMode = "input" | "output"

export type ModerationSeverity = "info" | "warn" | "block"

export type ModerationCategory =
  | "pii_email"
  | "pii_phone"
  | "pii_ssn"
  | "pii_credit_card"
  | "secret_api_key"
  | "prompt_injection"
  | "self_harm"
  | "hate_speech"
  | "violence"
  | "dangerous_instructions"
  | "profanity"
  | (string & {})

export interface ModerationFlag {
  name: string
  category: ModerationCategory
  severity: ModerationSeverity
  match?: string
}

export interface ModerationResult {
  allowed: boolean
  flags: ModerationFlag[]
}

export interface Moderator {
  check(text: string, mode: ModerationMode): Promise<ModerationResult>
  scrub(text: string): Promise<string>
}
