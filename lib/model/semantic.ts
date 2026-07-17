// Semantic layer for the measure engine — the Power-BI-style definitions of
// what can be measured and sliced. Measures and dimensions are declared once
// here and resolved by lib/model/query.ts; dashboards consume the engine rather
// than hand-rolling their own aggregation.

export type MeasureFormat = "int" | "num" | "baht"
export type MeasureGroup = "performance" | "revenue" | "cost" | "fuel" | "ratio"

interface BaseMeasure {
  key: string
  label: string
  group: MeasureGroup
  format: MeasureFormat
}

// Additive measure summed straight from a flat fact field.
export interface SumMeasure extends BaseMeasure {
  kind: "sum"
  field: string
}

// Additive measure pulled from one category of a by-category map field
// (e.g. ค่าขนส่งแยกประเภท → "ค่าขนส่ง").
export interface CategoryMeasure extends BaseMeasure {
  kind: "category"
  mapField: string
  category: string
}

// Calculated measure evaluated AFTER aggregation, over the summed totals of the
// measures it depends on. Ratios (บาท/เที่ยว) belong here — they must never be
// summed row-wise.
export interface CalcMeasure extends BaseMeasure {
  kind: "calc"
  deps: string[]
  eval: (m: Record<string, number>) => number
}

export type Measure = SumMeasure | CategoryMeasure | CalcMeasure

export interface Dimension {
  key: string // fact field to group on
  label: string
  table: string // lineage: which model table it conceptually belongs to
}

const MAP_TRANSPORT = "ค่าขนส่งแยกประเภท"
const REV_KEYS = ["ค่าขนส่ง", "ค่าโอนย้าย", "ประกันรายได้ + ค่าอื่นๆ"]
const safeDiv = (a: number, b: number) => (b ? a / b : 0)

// ── truck-summary model ──────────────────────────────────────────────────────
const TRUCK_MEASURES: Measure[] = [
  // Performance
  { kind: "sum", key: "เที่ยว", label: "จำนวนเที่ยว", group: "performance", format: "int", field: "จำนวนเที่ยว" },
  { kind: "sum", key: "น้ำหนัก", label: "น้ำหนักรวม", group: "performance", format: "num", field: "น้ำหนักรวม" },
  // Revenue (transport cost split by category — these sum to ค่าขนส่งรวม)
  { kind: "category", key: "ค่าขนส่ง", label: "ค่าขนส่ง", group: "revenue", format: "baht", mapField: MAP_TRANSPORT, category: "ค่าขนส่ง" },
  { kind: "category", key: "ค่าโอนย้าย", label: "ค่าโอนย้าย", group: "revenue", format: "baht", mapField: MAP_TRANSPORT, category: "ค่าโอนย้าย" },
  { kind: "category", key: "ประกันรายได้ + ค่าอื่นๆ", label: "ประกันรายได้ + ค่าอื่นๆ", group: "revenue", format: "baht", mapField: MAP_TRANSPORT, category: "ประกันรายได้ + ค่าอื่นๆ" },
  // Cost / fuel
  { kind: "sum", key: "ค่าเที่ยวรวม", label: "ค่าเที่ยว (พขร.)", group: "cost", format: "baht", field: "ค่าเที่ยวรวม" },
  { kind: "sum", key: "ค่าเชื้อเพลิง", label: "ค่าเชื้อเพลิง", group: "cost", format: "baht", field: "ค่าเชื้อเพลิง" },
  { kind: "sum", key: "Oil", label: "Oil (ลิตร)", group: "fuel", format: "num", field: "Oil" },
  { kind: "sum", key: "NGV", label: "NGV (กก.)", group: "fuel", format: "num", field: "NGV" },
  // Calculated
  { kind: "calc", key: "รายได้รวม", label: "รายได้รวม", group: "revenue", format: "baht", deps: REV_KEYS, eval: (m) => REV_KEYS.reduce((s, k) => s + (m[k] ?? 0), 0) },
  { kind: "calc", key: "Oil+NGV", label: "เชื้อเพลิงรวม", group: "fuel", format: "num", deps: ["Oil", "NGV"], eval: (m) => (m["Oil"] ?? 0) + (m["NGV"] ?? 0) },
  { kind: "calc", key: "บาท/เที่ยว", label: "รายได้/เที่ยว", group: "ratio", format: "baht", deps: ["รายได้รวม", "เที่ยว"], eval: (m) => safeDiv(m["รายได้รวม"] ?? 0, m["เที่ยว"] ?? 0) },
  { kind: "calc", key: "น้ำหนัก/เที่ยว", label: "น้ำหนัก/เที่ยว", group: "ratio", format: "num", deps: ["น้ำหนัก", "เที่ยว"], eval: (m) => safeDiv(m["น้ำหนัก"] ?? 0, m["เที่ยว"] ?? 0) },
  { kind: "calc", key: "บาท/น้ำหนัก", label: "รายได้/น้ำหนัก", group: "ratio", format: "baht", deps: ["รายได้รวม", "น้ำหนัก"], eval: (m) => safeDiv(m["รายได้รวม"] ?? 0, m["น้ำหนัก"] ?? 0) },
  { kind: "calc", key: "ค่าเที่ยว/เที่ยว", label: "ค่าเที่ยวเฉลี่ย", group: "ratio", format: "baht", deps: ["ค่าเที่ยวรวม", "เที่ยว"], eval: (m) => safeDiv(m["ค่าเที่ยวรวม"] ?? 0, m["เที่ยว"] ?? 0) },
  { kind: "calc", key: "ค่าเชื้อเพลิง/เที่ยว", label: "ค่าเชื้อเพลิงเฉลี่ย", group: "ratio", format: "baht", deps: ["ค่าเชื้อเพลิง", "เที่ยว"], eval: (m) => safeDiv(m["ค่าเชื้อเพลิง"] ?? 0, m["เที่ยว"] ?? 0) },
]

const TRUCK_DIMENSIONS: Dimension[] = [
  { key: "ทะเบียนรถ", label: "ทะเบียนรถ", table: "dim_truck" },
  { key: "บริการ", label: "บริการ", table: "dim_service" },
  { key: "ศูนย์", label: "ศูนย์", table: "dim_fleet" },
  { key: "Fleet", label: "Fleet", table: "dim_fleet" },
  { key: "Site", label: "Site", table: "dim_fleet" },
  { key: "Group Site", label: "Group Site", table: "dim_fleet" },
  { key: "Plant", label: "Plant", table: "dim_fleet" },
  { key: "เชื้อเพลิง", label: "เชื้อเพลิง", table: "dim_truck" },
  { key: "Type", label: "Type", table: "dim_truck" },
  { key: "fuelType", label: "Oil/NGV", table: "dim_truck" },
  { key: "monthKey", label: "เดือน", table: "dim_month" },
]

export interface SemanticModel {
  modelKey: string
  martKey: string
  measures: Measure[]
  dimensions: Dimension[]
}

const SEMANTIC: Record<string, SemanticModel> = {
  "truck-summary": { modelKey: "truck-summary", martKey: "truck-summary", measures: TRUCK_MEASURES, dimensions: TRUCK_DIMENSIONS },
}

export function getSemanticModel(modelKey: string): SemanticModel | null {
  return SEMANTIC[modelKey] ?? null
}
