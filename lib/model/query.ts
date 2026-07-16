import type { Db, Document } from "mongodb"
import { MART_DATA_COLLECTION } from "@/lib/mart/engine"
import { getSemanticModel, type Measure } from "./semantic"

// ── Measure engine ───────────────────────────────────────────────────────────
// Resolves a semantic query (measures × dimensions × filters) against the mart
// fact. Grouping and aggregation happen in JS — never a Mongo pipeline over the
// mart — so the same computation rules the ETL uses stay authoritative.

export interface ModelQuery {
  modelKey?: string // default "truck-summary"
  measures: string[]
  dimensions?: string[] // group-by fields; [] → single grand-total row
  filters?: Array<{ field: string; values: string[] }>
  monthKey?: string
  months?: string[]
  sortBy?: string // measure key to sort rows desc by
}

export interface ModelRow {
  key: string
  dims: Record<string, string>
  values: Record<string, number>
}

export interface ModelResult {
  rows: ModelRow[]
  total: { values: Record<string, number> }
  meta: {
    measures: Array<{ key: string; label: string; group: string; format: string }>
    dimensions: string[]
    rowCount: number
  }
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round = (n: number) => Math.round(n * 100) / 100
const str = (v: unknown): string => (v == null ? "" : String(v))
const SEP = "||"

export async function runModelQuery(db: Db, q: ModelQuery): Promise<ModelResult> {
  const model = getSemanticModel(q.modelKey ?? "truck-summary")
  if (!model) throw new Error(`unknown model: ${q.modelKey}`)

  const byKey = new Map(model.measures.map((m) => [m.key, m]))
  const dimKeys = q.dimensions ?? []
  for (const d of dimKeys) {
    if (!model.dimensions.some((x) => x.key === d)) throw new Error(`unknown dimension: ${d}`)
  }

  // Resolve requested measures, expanding calc deps to the base measures needed.
  const needed = new Set<string>()
  const requested: Measure[] = []
  const addDeps = (key: string) => {
    const m = byKey.get(key)
    if (!m) throw new Error(`unknown measure: ${key}`)
    needed.add(key)
    if (m.kind === "calc") m.deps.forEach(addDeps)
  }
  for (const k of q.measures) {
    const m = byKey.get(k)
    if (!m) throw new Error(`unknown measure: ${k}`)
    requested.push(m)
    addDeps(k)
  }
  // Base (summable) measures we must accumulate, in registry order.
  const baseMeasures = model.measures.filter((m) => needed.has(m.key) && m.kind !== "calc")
  const calcMeasures = model.measures.filter((m) => needed.has(m.key) && m.kind === "calc")

  // ── Mongo filter + projection (find only, JS does the math) ──
  const filter: Document = { martKey: model.martKey }
  if (q.monthKey) filter.monthKey = q.monthKey
  else if (q.months?.length) filter.monthKey = { $in: q.months }
  for (const f of q.filters ?? []) {
    if (f.values?.length) filter[f.field] = f.values.length === 1 ? f.values[0] : { $in: f.values }
  }

  const projection: Document = { _id: 0 }
  for (const d of dimKeys) projection[d] = 1
  for (const m of baseMeasures) {
    if (m.kind === "sum") projection[m.field] = 1
    else if (m.kind === "category") projection[m.mapField] = 1
  }

  const rows = await db.collection(MART_DATA_COLLECTION).find(filter, { projection }).toArray()

  // ── Group in JS ──
  interface Acc {
    dims: Record<string, string>
    sums: Record<string, number>
  }
  const groups = new Map<string, Acc>()
  const totalSums: Record<string, number> = {}

  const accumulate = (acc: Record<string, number>, r: Document) => {
    for (const m of baseMeasures) {
      if (m.kind === "sum") {
        acc[m.key] = (acc[m.key] ?? 0) + num(r[m.field])
      } else if (m.kind === "category") {
        const map = (r[m.mapField] ?? {}) as Record<string, unknown>
        acc[m.key] = (acc[m.key] ?? 0) + num(map[m.category])
      }
    }
  }

  for (const r of rows) {
    const key = dimKeys.map((d) => str(r[d])).join(SEP)
    let g = groups.get(key)
    if (!g) {
      const dims: Record<string, string> = {}
      for (const d of dimKeys) dims[d] = str(r[d]) || "(ไม่ระบุ)"
      g = { dims, sums: {} }
      groups.set(key, g)
    }
    accumulate(g.sums, r)
    accumulate(totalSums, r)
  }

  // ── Finalize: evaluate calc measures over the summed totals, then round ──
  const finalize = (sums: Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = { ...sums }
    for (const c of calcMeasures) out[c.key] = (c as Extract<Measure, { kind: "calc" }>).eval(out)
    const values: Record<string, number> = {}
    for (const m of requested) {
      const v = out[m.key] ?? 0
      values[m.key] = m.format === "int" ? Math.round(v) : round(v)
    }
    return values
  }

  const sortKey = q.sortBy && byKey.has(q.sortBy) ? q.sortBy : requested.find((m) => m.group === "revenue" || m.kind === "calc")?.key ?? requested[0]?.key
  const outRows: ModelRow[] = [...groups.entries()].map(([key, g]) => ({
    key,
    dims: g.dims,
    values: finalize(g.sums),
  }))
  if (sortKey) outRows.sort((a, b) => (b.values[sortKey] ?? 0) - (a.values[sortKey] ?? 0))

  return {
    rows: outRows,
    total: { values: finalize(totalSums) },
    meta: {
      measures: requested.map((m) => ({ key: m.key, label: m.label, group: m.group, format: m.format })),
      dimensions: dimKeys,
      rowCount: outRows.length,
    },
  }
}
