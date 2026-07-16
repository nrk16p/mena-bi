import type { Db } from "mongodb"

export const SUMMARY_DATA_COLLECTION = "summaryData"

export interface SummaryDoc {
  monthKey: string
  YM: number
  ทะเบียนรถ: string
  ศูนย์: string | null
  บริการ: string | null
  Fleet: string | null
  Site: string | null
  เชื้อเพลิง: string | null
  Type: string | null
  weight: {
    trips: number
    totalWeight: number
    totalWeightOrigin: number
    totalWeightDest: number
  } | null
  cost: {
    rows: number
    total: number
    byCategory: Record<string, { rows: number; amount: number }>
  } | null
  snapshotAt: Date
}

interface WeightAgg {
  trips: number
  totalWeight: number
  totalWeightOrigin: number
  totalWeightDest: number
}

interface CostAgg {
  rows: number
  total: number
  byCategory: Record<string, { rows: number; amount: number }>
}

function ymToMonthKey(ym: number): string {
  return `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, "0")}`
}

const round = (n: number) => Math.round(n * 100) / 100

export async function buildMonthSnapshot(
  db: Db,
  ym: number
): Promise<{
  monthKey: string
  docs: SummaryDoc[]
  trucks: number
  weightMatched: number
  costMatched: number
}> {
  const monthKey = ymToMonthKey(ym)

  const [truckRows, weightRows, costRows] = await Promise.all([
    db.collection("mastertruck").find({ YM: ym }, { projection: { _id: 0 } }).toArray(),
    db
      .collection("weightData")
      .find(
        { monthKey },
        { projection: { _id: 0, plateHead: 1, plateTail: 1, weight: 1, weightOrigin: 1, weightDest: 1 } }
      )
      .toArray(),
    db
      .collection("transportCost")
      .find({ monthKey }, { projection: { _id: 0, plateHead: 1, amount: 1, category: 1 } })
      .toArray(),
  ])

  if (!truckRows.length) {
    return { monthKey, docs: [], trucks: 0, weightMatched: 0, costMatched: 0 }
  }

  // Index weight by plate — a trip counts for BOTH plateHead and plateTail
  const weightByPlate = new Map<string, WeightAgg>()
  for (const row of weightRows) {
    const plates = new Set<string>()
    if (row.plateHead) plates.add(String(row.plateHead))
    if (row.plateTail) plates.add(String(row.plateTail))
    for (const plate of plates) {
      const agg = weightByPlate.get(plate) ?? {
        trips: 0,
        totalWeight: 0,
        totalWeightOrigin: 0,
        totalWeightDest: 0,
      }
      agg.trips++
      agg.totalWeight += Number(row.weight) || 0
      agg.totalWeightOrigin += Number(row.weightOrigin) || 0
      agg.totalWeightDest += Number(row.weightDest) || 0
      weightByPlate.set(plate, agg)
    }
  }

  // Index cost by plateHead only
  const costByPlate = new Map<string, CostAgg>()
  for (const row of costRows) {
    if (!row.plateHead) continue
    const plate = String(row.plateHead)
    const agg = costByPlate.get(plate) ?? { rows: 0, total: 0, byCategory: {} }
    agg.rows++
    const amount = Number(row.amount) || 0
    agg.total += amount
    const cat = String(row.category ?? "ไม่ระบุ")
    const bucket = (agg.byCategory[cat] ??= { rows: 0, amount: 0 })
    bucket.rows++
    bucket.amount += amount
    costByPlate.set(plate, agg)
  }

  const snapshotAt = new Date()
  let weightMatched = 0
  let costMatched = 0

  const docs: SummaryDoc[] = truckRows.map((t) => {
    const plate = t["ทะเบียนรถ"] != null ? String(t["ทะเบียนรถ"]) : ""
    const weightAgg = weightByPlate.get(plate) ?? null
    const costAgg = costByPlate.get(plate) ?? null
    if (weightAgg) weightMatched++
    if (costAgg) costMatched++

    return {
      monthKey,
      YM: ym,
      ทะเบียนรถ: plate,
      ศูนย์: t["ศูนย์"] != null ? String(t["ศูนย์"]) : null,
      บริการ: t["บริการ"] != null ? String(t["บริการ"]) : null,
      Fleet: t["Fleet"] != null ? String(t["Fleet"]) : null,
      Site: t["Site"] != null ? String(t["Site"]) : null,
      เชื้อเพลิง: t["เชื้อเพลิง"] != null ? String(t["เชื้อเพลิง"]) : null,
      Type: t["Type"] != null ? String(t["Type"]) : null,
      weight: weightAgg
        ? {
            trips: weightAgg.trips,
            totalWeight: round(weightAgg.totalWeight),
            totalWeightOrigin: round(weightAgg.totalWeightOrigin),
            totalWeightDest: round(weightAgg.totalWeightDest),
          }
        : null,
      cost: costAgg
        ? {
            rows: costAgg.rows,
            total: round(costAgg.total),
            byCategory: Object.fromEntries(
              Object.entries(costAgg.byCategory).map(([k, v]) => [
                k,
                { rows: v.rows, amount: round(v.amount) },
              ])
            ),
          }
        : null,
      snapshotAt,
    }
  })

  return { monthKey, docs, trucks: truckRows.length, weightMatched, costMatched }
}
