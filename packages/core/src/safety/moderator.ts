import type {
  ModerationCategory,
  ModerationFlag,
  ModerationMode,
  ModerationResult,
  ModerationSeverity,
  Moderator,
} from "./types.ts"

export interface ModerationPattern {
  name: string
  category: ModerationCategory
  pattern: RegExp
  severity: ModerationSeverity
  modes?: ModerationMode[]
}

export const DEFAULT_INPUT_PATTERNS: ModerationPattern[] = [
  {
    name: "email",
    category: "pii_email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    severity: "warn",
  },
  {
    name: "phone_us",
    category: "pii_phone",
    pattern: /\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    severity: "warn",
  },
  {
    name: "ssn",
    category: "pii_ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    severity: "block",
  },
  {
    name: "credit_card",
    category: "pii_credit_card",
    pattern: /\b(?:\d[ -]?){15,18}\d\b/g,
    severity: "block",
  },
  {
    name: "ignore_instructions",
    category: "prompt_injection",
    pattern: /\bignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?)\b/gi,
    severity: "block",
  },
  {
    name: "you_are_now",
    category: "prompt_injection",
    pattern: /\byou\s+are\s+now\s+(a|an)\s+/gi,
    severity: "warn",
  },
  {
    name: "system_prompt_reveal",
    category: "prompt_injection",
    pattern: /\b(reveal|show|print|repeat)\s+(the\s+)?(system|hidden|initial)\s+prompt\b/gi,
    severity: "block",
  },
]

export const DEFAULT_OUTPUT_PATTERNS: ModerationPattern[] = [
  {
    name: "explosive_howto",
    category: "dangerous_instructions",
    pattern: /\b(how\s+to\s+)?make\s+(a\s+)?(pipe\s+)?bomb\b/gi,
    severity: "block",
  },
  {
    name: "self_harm",
    category: "self_harm",
    pattern: /\bhow\s+to\s+(kill|hurt)\s+(myself|yourself)\b/gi,
    severity: "block",
  },
]

function appliesTo(pattern: ModerationPattern, mode: ModerationMode): boolean {
  if (!pattern.modes) return true
  return pattern.modes.includes(mode)
}

export class RegexPatternModerator implements Moderator {
  constructor(private readonly patterns: ModerationPattern[]) {}

  async check(text: string, mode: ModerationMode): Promise<ModerationResult> {
    const flags: ModerationFlag[] = []
    let allowed = true
    for (const p of this.patterns) {
      if (!appliesTo(p, mode)) continue
      p.pattern.lastIndex = 0
      const matches = text.match(p.pattern)
      if (!matches) continue
      for (const m of matches) {
        flags.push({ name: p.name, category: p.category, severity: p.severity, match: m })
      }
      if (p.severity === "block") allowed = false
    }
    return { allowed, flags }
  }

  async scrub(text: string): Promise<string> {
    let out = text
    for (const p of this.patterns) {
      out = out.replace(p.pattern, `[REDACTED:${p.category}]`)
    }
    return out
  }
}

export class CompositeModerator implements Moderator {
  constructor(private readonly moderators: Moderator[]) {}

  async check(text: string, mode: ModerationMode): Promise<ModerationResult> {
    const flags: ModerationFlag[] = []
    let allowed = true
    for (const m of this.moderators) {
      const r = await m.check(text, mode)
      flags.push(...r.flags)
      if (!r.allowed) allowed = false
    }
    return { allowed, flags }
  }

  async scrub(text: string): Promise<string> {
    let out = text
    for (const m of this.moderators) {
      out = await m.scrub(out)
    }
    return out
  }
}
