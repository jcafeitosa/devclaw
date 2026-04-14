import { describe, expect, test } from "bun:test"
import { parseSkillMarkdown } from "../../src/skill/parser.ts"

describe("parseSkillMarkdown", () => {
  test("parses full skill file with inputs + constraints + steps", () => {
    const text = `---
name: execute_trade
version: 1.2.0
status: active
description: Execute a trade on supported exchanges
tags: [trading, finance]
triggers: [trade, buy, sell]
inputs:
  - name: symbol
    type: string
    required: true
  - name: side
    type: string
  - name: quantity
    type: number
context_requirements: [market_data, account_balance]
tools: [exchange_api, risk_check]
steps: [validate_inputs, check_risk, execute, log_audit]
constraints:
  max_value_usd: 1000
  requires_approval: true
author: backend
---
body text describing procedure`
    const skill = parseSkillMarkdown("fallback", text)
    expect(skill.id).toBe("execute_trade")
    expect(skill.version).toBe("1.2.0")
    expect(skill.status).toBe("active")
    expect(skill.description).toContain("Execute a trade")
    expect(skill.tags).toEqual(["trading", "finance"])
    expect(skill.inputs).toHaveLength(3)
    expect(skill.inputs[0]).toEqual({ name: "symbol", type: "string", required: true })
    expect(skill.contextRequirements).toEqual(["market_data", "account_balance"])
    expect(skill.tools).toEqual(["exchange_api", "risk_check"])
    expect(skill.steps).toHaveLength(4)
    expect(skill.constraints?.maxValueUsd).toBe(1000)
    expect(skill.constraints?.requiresApproval).toBe(true)
    expect(skill.body.trim()).toBe("body text describing procedure")
  })

  test("defaults status=draft and version=1.0.0", () => {
    const s = parseSkillMarkdown("x", `---\n---\nempty`)
    expect(s.status).toBe("draft")
    expect(s.version).toBe("1.0.0")
  })

  test("invalid status falls back to draft", () => {
    const s = parseSkillMarkdown("x", `---\nstatus: invalid\n---\n`)
    expect(s.status).toBe("draft")
  })
})
