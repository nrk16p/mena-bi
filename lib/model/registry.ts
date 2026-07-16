// Semantic model — the "data model" behind the dashboards, Power BI style:
// tables (fact + dimensions), the columns on each, and the relationships that
// join them. View-only for now; the same shape can later drive a measure engine.

export type ColRole = "key" | "attr" | "measure"

export interface ModelColumn {
  name: string
  role: ColRole
}

export interface ModelTable {
  name: string // collection name in mena-bi
  title: string
  kind: "fact" | "dim"
  columns: ModelColumn[]
}

export interface ModelRelationship {
  from: { table: string; column: string } // many side
  to: { table: string; column: string } // one side
  cardinality: "many-to-one"
}

export interface DataModel {
  modelKey: string
  name: string
  description: string
  tables: ModelTable[]
  relationships: ModelRelationship[]
}

// The truck-summary snowflake model (matches lib/mart/engine.ts output).
export const TRUCK_MODEL: DataModel = {
  modelKey: "truck-summary",
  name: "สรุปรายรถ (Snowflake Model)",
  description: "fact = สรุปรายรถ (martData) เชื่อม dim_truck → dim_fleet, dim_service, dim_month",
  tables: [
    {
      name: "martData",
      title: "fact_summary",
      kind: "fact",
      columns: [
        { name: "ทะเบียนรถ", role: "key" },
        { name: "บริการ", role: "key" },
        { name: "monthKey", role: "key" },
        { name: "fuelType", role: "attr" },
        { name: "จำนวนเที่ยว", role: "measure" },
        { name: "น้ำหนักรวม", role: "measure" },
        { name: "ค่าขนส่งรวม", role: "measure" },
        { name: "ค่าขนส่งแยกประเภท", role: "measure" },
        { name: "ค่าเที่ยวรวม", role: "measure" },
        { name: "Oil", role: "measure" },
        { name: "NGV", role: "measure" },
      ],
    },
    {
      name: "dim_truck",
      title: "dim_truck",
      kind: "dim",
      columns: [
        { name: "ทะเบียนรถ", role: "key" },
        { name: "YM", role: "attr" },
        { name: "fleetKey", role: "key" },
        { name: "fuelType", role: "attr" },
      ],
    },
    {
      name: "dim_fleet",
      title: "dim_fleet",
      kind: "dim",
      columns: [
        { name: "fleetKey", role: "key" },
        { name: "Fleet", role: "attr" },
        { name: "Site", role: "attr" },
        { name: "Group Site", role: "attr" },
      ],
    },
    {
      name: "dim_service",
      title: "dim_service",
      kind: "dim",
      columns: [{ name: "บริการ", role: "key" }],
    },
    {
      name: "dim_month",
      title: "dim_month",
      kind: "dim",
      columns: [
        { name: "monthKey", role: "key" },
        { name: "YM", role: "attr" },
        { name: "year", role: "attr" },
        { name: "month", role: "attr" },
        { name: "quarter", role: "attr" },
      ],
    },
  ],
  relationships: [
    { from: { table: "martData", column: "ทะเบียนรถ" }, to: { table: "dim_truck", column: "ทะเบียนรถ" }, cardinality: "many-to-one" },
    { from: { table: "dim_truck", column: "fleetKey" }, to: { table: "dim_fleet", column: "fleetKey" }, cardinality: "many-to-one" },
    { from: { table: "martData", column: "บริการ" }, to: { table: "dim_service", column: "บริการ" }, cardinality: "many-to-one" },
    { from: { table: "martData", column: "monthKey" }, to: { table: "dim_month", column: "monthKey" }, cardinality: "many-to-one" },
  ],
}

export const MODELS: Record<string, DataModel> = {
  "truck-summary": TRUCK_MODEL,
}
