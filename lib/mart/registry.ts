import type { Db } from "mongodb"
import type { MartConfig } from "./engine"

export const MARTS_COLLECTION = "etl_marts"

// Flagship snowflake mart: one row per truck × service × month, with weight,
// transport cost, driver fee and fuel quantity joined on plate + service.
export const TRUCK_SUMMARY: MartConfig = {
  martKey: "truck-summary",
  name: "สรุปรายรถ (Master รถ × น้ำหนัก × ค่าขนส่ง × ค่าเที่ยว × เชื้อเพลิง)",
  description: "รายรถต่อเดือน — grain = ทะเบียน × บริการ; น้ำหนักนับคู่ head+tail; Oil/NGV จาก fuelQtyData",
  grainMaster: "mastertruck",
  monthField: "YM",
  grainKeys: ["ทะเบียนรถ", "บริการ"],
  plateField: "ทะเบียนรถ",
  serviceKey: "บริการ",
  dimAttrs: ["ศูนย์", "Fleet", "Site", "Group Site", "Plant", "เชื้อเพลิง", "Type"],
  fleetAttrs: ["Fleet", "Site", "Group Site"],
  fuelTypeSource: { source: "fuelQtyData", plateField: "plateHead", typeField: "fuelType" },
  measures: [
    {
      source: "weightData",
      plateKeys: ["plateHead", "plateTail"], // นับคู่: 1 เที่ยวนับให้ทั้งหัวและหาง
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
