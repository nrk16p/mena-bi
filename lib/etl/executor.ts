// Generic executor for dynamic flows: fetch source rows → month attribution →
// dedupe → apply rules → raw docs for the target collection.
// All computation happens here in JS; Mongo only serves indexed finds.

import type { Db, Document } from "mongodb"
import { applyRules, type EtlRule, type RuleRecord } from "./engine"
import type { FlowConfig } from "./flows"
import { monthKeyOf, parseIssueMonth } from "../trip-count/calculate"

export interface FlowMonthResult {
  monthKey: string
  year: number
  month: number
  candidates: number // rows after month filter + dedupe, before rules
  docs: Document[]
  excluded: { total: number; byRule: Record<string, number> }
}

// Fetch slim source rows for a target month via the (_year,_month,_branch) index.
// When monthField is set, include ±1 neighbouring file-months (the date can fall
// outside the month of the report file the row came from).
export async function fetchFlowRows(
  db: Db,
  flow: FlowConfig,
  year: number,
  month: number
): Promise<Document[]> {
  const deltas = flow.monthField ? [-1, 0, 1] : [0]
  const fileMonths = deltas.map((delta) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1))
    return { _year: d.getUTCFullYear(), _month: d.getUTCMonth() + 1 }
  })

  const fields = new Set(flow.columns)
  if (flow.monthField) fields.add(flow.monthField)
  if (flow.dedupeField) fields.add(flow.dedupeField)
  const projection: Record<string, 0 | 1> = { _id: 0 }
  for (const f of fields) projection[f] = 1

  return db
    .collection(flow.sourceCollection)
    .find({ $or: fileMonths }, { projection })
    .toArray()
}

function toRuleRecord(row: Document, fields: string[]): RuleRecord {
  const record: RuleRecord = {}
  for (const f of fields) {
    const v = row[f]
    record[f] = v == null ? "" : v instanceof Date ? v.toISOString() : String(v)
  }
  return record
}

export function buildFlowMonthData(
  rows: Document[],
  flow: FlowConfig,
  rules: EtlRule[],
  year: number,
  month: number
): FlowMonthResult {
  // 1) month attribution + 2) dedupe
  let candidates: Document[]
  if (flow.dedupeField) {
    const seen = new Map<string, Document>()
    for (const row of rows) {
      const key = row[flow.dedupeField]
      if (key == null || key === "") continue
      const k = String(key)
      if (flow.monthField) {
        const issued = parseIssueMonth(row[flow.monthField] ?? null)
        if (!issued || issued.year !== year || issued.month !== month) continue
      }
      if (!seen.has(k)) seen.set(k, row)
    }
    candidates = [...seen.values()]
  } else {
    candidates = flow.monthField
      ? rows.filter((row) => {
          const issued = parseIssueMonth(row[flow.monthField!] ?? null)
          return issued !== null && issued.year === year && issued.month === month
        })
      : rows
  }

  // 3) rules → 4) target docs
  const monthKey = monthKeyOf(year, month)
  const docs: Document[] = []
  const excluded = { total: 0, byRule: {} as Record<string, number> }

  for (const row of candidates) {
    const cutBy = applyRules(toRuleRecord(row, flow.ruleFields), rules)
    if (cutBy) {
      excluded.total += 1
      excluded.byRule[cutBy.label] = (excluded.byRule[cutBy.label] ?? 0) + 1
      continue
    }
    const doc: Document = { monthKey, year, month }
    for (const c of flow.columns) doc[c] = row[c] ?? null
    if (flow.monthField && !flow.columns.includes(flow.monthField)) {
      doc[flow.monthField] = row[flow.monthField] ?? null
    }
    if (flow.dedupeField && !flow.columns.includes(flow.dedupeField)) {
      doc[flow.dedupeField] = row[flow.dedupeField] ?? null
    }
    docs.push(doc)
  }

  return { monthKey, year, month, candidates: candidates.length, docs, excluded }
}
