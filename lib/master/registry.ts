// Master data registry — one entry per hand-maintained reference table.
// Adding a master here gives it the API, page, Excel import/export and template.

export interface MasterConfig {
  key: string // URL segment, e.g. "mastertruck"
  name: string
  description: string
  collection: string // in db mena-bi
  columns: string[] // display + export order (YM first)
  numericColumns: string[] // parsed as numbers on import
  searchFields: string[] // text search targets
  /** every imported row must have these — rows without them are skipped */
  requiredColumns: string[]
  sort: Record<string, 1 | -1>
}

export const MASTERS: Record<string, MasterConfig> = {
  mastertruck: {
    key: "mastertruck",
    name: "Master รถ",
    description: "ทะเบียนรถ × บริการ รายเดือน (Fleet / Site / Plant / เชื้อเพลิง)",
    collection: "mastertruck",
    columns: ["YM", "ศูนย์", "บริการ", "ทะเบียนรถ", "Fleet", "Site", "Group Site", "Plant", "เชื้อเพลิง", "Type"],
    numericColumns: [],
    searchFields: ["ทะเบียนรถ", "บริการ", "ศูนย์", "Fleet", "Site"],
    requiredColumns: ["ทะเบียนรถ"],
    sort: { YM: -1, ศูนย์: 1, บริการ: 1, ทะเบียนรถ: 1 },
  },
  fuelrate: {
    key: "fuelrate",
    name: "Master ราคาน้ำมัน",
    description: "ราคาน้ำมัน/ลิตร ต่อ Fleet รายเดือน",
    collection: "fuelRate",
    columns: ["YM", "Fleet", "ราคาน้ำมัน/ลิตร"],
    numericColumns: ["ราคาน้ำมัน/ลิตร"],
    searchFields: ["Fleet"],
    requiredColumns: ["Fleet"],
    sort: { YM: -1, Fleet: 1 },
  },
  performancelogic: {
    key: "performancelogic",
    name: "Master Logic",
    description: "Logic วัดผล Performance ต่อ Fleet × Site (น้ำหนัก / เที่ยว / วันทำงาน)",
    collection: "performanceLogic",
    columns: ["YM", "Fleet", "Site", "Logic"],
    numericColumns: [],
    searchFields: ["Fleet", "Site", "Logic"],
    requiredColumns: ["Fleet", "Site"],
    sort: { YM: -1, Fleet: 1, Site: 1 },
  },
}
