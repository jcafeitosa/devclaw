import type { SchemaProperty, ToolSchema } from "./types.ts"

export type ValidateResult = { ok: true } | { ok: false; issues: string[] }

export function validateInput(schema: ToolSchema, value: unknown): ValidateResult {
  const issues: string[] = []
  checkObject(schema, value, "", issues)
  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}

function checkObject(
  schema: { properties: Record<string, SchemaProperty>; required?: readonly string[] },
  value: unknown,
  path: string,
  issues: string[],
): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push(`${path || "root"}: expected object`)
    return
  }
  const obj = value as Record<string, unknown>
  for (const req of schema.required ?? []) {
    if (!(req in obj)) issues.push(`${join(path, req)}: missing required field`)
  }
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (!(key in obj)) continue
    checkProp(prop, obj[key], join(path, key), issues)
  }
}

function checkProp(prop: SchemaProperty, value: unknown, path: string, issues: string[]): void {
  switch (prop.type) {
    case "string":
      if (typeof value !== "string") {
        issues.push(`${path}: expected string`)
        return
      }
      if (prop.enum && !prop.enum.includes(value)) {
        issues.push(`${path}: expected one of [${prop.enum.join(", ")}]`)
      }
      return
    case "number":
      if (typeof value !== "number") issues.push(`${path}: expected number`)
      return
    case "boolean":
      if (typeof value !== "boolean") issues.push(`${path}: expected boolean`)
      return
    case "array":
      if (!Array.isArray(value)) {
        issues.push(`${path}: expected array`)
        return
      }
      if (prop.items) {
        const itemSchema = prop.items
        for (let i = 0; i < value.length; i++) {
          checkProp(itemSchema, value[i], `${path}[${i}]`, issues)
        }
      }
      return
    case "object":
      checkObject(
        {
          properties: prop.properties ?? {},
          required: prop.required,
        },
        value,
        path,
        issues,
      )
  }
}

function join(base: string, key: string): string {
  return base ? `${base}.${key}` : key
}
