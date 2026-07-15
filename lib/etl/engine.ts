// Generic exclusion-rule engine shared by every ETL flow.
// A rule matches a flat string record; first enabled match cuts the row.

export type RuleOperator = "equals" | "contains" | "contains_word"

export interface EtlRule {
  id: string
  label: string // shown in UI + used as the cut reason
  field: string // key in the record, e.g. "บริการ"
  operator: RuleOperator
  values: string[]
  enabled: boolean
}

export interface EtlRuleDoc {
  flowKey: string
  name: string
  version: number
  rules: EtlRule[]
  updatedAt?: Date
  updatedBy?: string
}

export type RuleRecord = Record<string, string>

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function matchRule(record: RuleRecord, rule: EtlRule): boolean {
  const raw = (record[rule.field] ?? "").trim()
  if (!raw) return false
  const lower = raw.toLowerCase()
  return rule.values.some((v) => {
    const value = v.trim()
    if (!value) return false
    switch (rule.operator) {
      case "equals":
        return raw === value
      case "contains":
        return lower.includes(value.toLowerCase())
      case "contains_word":
        return new RegExp(`\\b${escapeRegExp(value)}\\b`).test(raw)
    }
  })
}

// Returns the first enabled rule that cuts the record, or null to keep it.
export function applyRules(record: RuleRecord, rules: EtlRule[]): EtlRule | null {
  for (const rule of rules) {
    if (!rule.enabled) continue
    if (matchRule(record, rule)) return rule
  }
  return null
}

export function validateRules(rules: unknown): rules is EtlRule[] {
  if (!Array.isArray(rules)) return false
  const ops: RuleOperator[] = ["equals", "contains", "contains_word"]
  return rules.every(
    (r) =>
      r &&
      typeof r.id === "string" &&
      typeof r.label === "string" &&
      typeof r.field === "string" &&
      ops.includes(r.operator) &&
      Array.isArray(r.values) &&
      r.values.every((v: unknown) => typeof v === "string") &&
      typeof r.enabled === "boolean"
  )
}
