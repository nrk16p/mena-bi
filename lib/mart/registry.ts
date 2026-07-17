import type { Db } from "mongodb"
import type { MartConfig } from "./engine"

export const MARTS_COLLECTION = "etl_marts"

// Flagship snowflake mart: one row per truck × service × month, with weight,
// transport cost, driver fee and fuel quantity joined on plate + service.
export const TRUCK_SUMMARY: MartConfig = {
  martKey: "truck-summary",
  name: "สรุปรายรถ (Master รถ × น้ำหนัก × ค่าขนส่ง × ค่าเที่ยว × เชื้อเพลิง)",
  description: "รายรถต่อเดือน — grain = ทะเบียน(หัว) × บริการ; ใช้หัวเป็นหลักไม่นับหาง; ค่าเชื้อเพลิง = Oil/NGV × ราคาน้ำมัน",
  grainMaster: "mastertruck",
  monthField: "YM",
  grainKeys: ["ทะเบียนรถ", "บริการ"],
  plateField: "ทะเบียนรถ",
  serviceKey: "บริการ",
  dimAttrs: ["ศูนย์", "Fleet", "Site", "Group Site", "Plant", "เชื้อเพลิง", "Type"],
  fleetAttrs: ["Fleet", "Site", "Group Site"],
  fuelTypeSource: { source: "fuelQtyData", plateField: "plateHead", typeField: "fuelType" },
  // หัว (head) is always the grain; a หาง (tail) is never its own row — it rolls
  // into its head. Tails always have a head; heads may have many tails or none.
  grainExclude: { field: "Type", values: ["หาง", "หาง-รถร่วม"] },
  measures: [
    {
      source: "weightData",
      plateKeys: ["plateHead"], // หัวเป็นหลัก: 1 เที่ยว = 1 แถวส่งของ นับให้หัวครั้งเดียว
      serviceField: "service",
      fields: [{ field: "weight", as: "น้ำหนักรวม" }],
      countAs: "จำนวนเที่ยว",
    },
    {
      source: "transportCost",
      plateKeys: ["plateHead"],
      serviceField: "service",
      fields: [{ field: "amount", as: "ค่าขนส่งรวม" }],
      groupByField: "category",
      groupByAs: "ค่าขนส่งแยกประเภท",
    },
    {
      source: "driverCostData",
      plateKeys: ["plateHead"],
      serviceField: "service",
      fields: [{ field: "fee", as: "ค่าเที่ยวรวม" }],
    },
    {
      source: "fuelQtyData",
      plateKeys: ["plateHead"],
      serviceField: "service",
      fields: [
        { field: "oil", as: "Oil" },
        { field: "ngv", as: "NGV" },
      ],
    },
  ],
  // Master ราคาน้ำมัน: ค่าเชื้อเพลิง = Oil × rate + NGV × rate, rate keyed on
  // YM × เชื้อเพลิง (fuelRate's "Fleet" column actually holds เชื้อเพลิง values,
  // with an " Oil"/" NGV" suffix on Side Curtain & Trailer).
  rateJoins: [
    {
      source: "fuelRate",
      ymField: "YM",
      keyField: "เชื้อเพลิง",
      rateKeyField: "Fleet",
      rateField: "ราคาน้ำมัน/ลิตร",
      terms: [
        { qty: "Oil", fuelType: "Oil" },
        { qty: "NGV", fuelType: "NGV" },
      ],
      as: "ค่าเชื้อเพลิง",
    },
  ],
  // Master Logic: KPI rule (น้ำหนัก / เที่ยว / วันทำงาน) per Fleet × Site.
  // No ymField → the rule is month-agnostic and applies to every mart month.
  attrJoins: [
    { source: "performanceLogic", keyFields: ["Fleet", "Site"], valueField: "Logic", as: "Logic" },
  ],
}

const STATIC_MARTS: Record<string, MartConfig> = {
  "truck-summary": TRUCK_SUMMARY,
}

export async function getMart(db: Db, martKey: string): Promise<MartConfig | null> {
  if (STATIC_MARTS[martKey]) return STATIC_MARTS[martKey]
  const doc = await db.collection<MartConfig>(MARTS_COLLECTION).findOne({ martKey })
  return doc ?? null
}

export async function getAllMarts(db: Db): Promise<MartConfig[]> {
  const dynamic = await db.collection<MartConfig>(MARTS_COLLECTION).find({}).sort({ martKey: 1 }).toArray()
  return [...Object.values(STATIC_MARTS), ...dynamic.map((d) => ({ ...d, _id: undefined }) as MartConfig)]
}
