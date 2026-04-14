export interface RedactionPattern {
  name: string
  pattern: RegExp
}

export const DEFAULT_REDACTION_PATTERNS: readonly RedactionPattern[] = [
  { name: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "credit_card", pattern: /\b(?:\d[ -]?){15,18}\d\b/g },
  { name: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._\-~+/]{20,}=*\b/gi },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "api_key", pattern: /\b[A-Za-z0-9_-]{32,}\b/g },
  { name: "password_kv", pattern: /\b(password|passwd|pwd)\s*[=:]\s*\S+/gi },
]

export function redactOutput(
  input: string,
  patterns: readonly RedactionPattern[] = DEFAULT_REDACTION_PATTERNS,
): string {
  let out = input
  for (const p of patterns) {
    out = out.replace(p.pattern, `[REDACTED:${p.name}]`)
  }
  return out
}
