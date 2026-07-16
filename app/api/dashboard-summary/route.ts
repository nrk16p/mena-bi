import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { MART_DATA_COLLECTION } from "@/lib/mart/engine"

const MART_KEY = "truck-summary"
const REVENUE_CATS = ["ค่าขนส่ง", "ค่าโอนย้าย", "ประกันรายได้ + ค่าอื่นๆ"]
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round = (n: number) => Math.round(n * 100) / 100

// GET /api/dashboard-summary — executive KPIs for the latest available month:
// Performance (เที่ยว, น้ำหนัก), Revenue (3 categories), revenue by Fleet, and a
// month-over-month revenue trend. Computed in JS over the truck-summary fact.
export async function GET() {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const client = await clientPromise
  const col = client.db(DELIVER_DB).collection(MART_DATA_COLLECTION)

  const months = (await col.distinct("monthKey", { martKey: MART_KEY })).sort()
  if (!months.length) {
    return NextResponse.json({ success: true, data: { month: null, months: [] } })
  }
  const month = months[months.length - 1]

  const rows = await col
    .find(
      { martKey: MART_KEY, monthKey: month },
      { projection: { _id: 0, ทะเบียนรถ: 1, Fleet: 1, จำนวนเที่ยว: 1, น้ำหนักรวม: 1, ค่าขนส่งแยกประเภท: 1 } }
    )
    .toArray()

  let trips = 0
  let weight = 0
  const rev: Record<string, number> = { ค่าขนส่ง: 0, ค่าโอนย้าย: 0, "ประกันรายได้ + ค่าอื่นๆ": 0 }
  const byFleet = new Map<string, number>()
  const trucks = new Set<string>()

  for (const r of rows) {
    trips += num(r["จำนวนเที่ยว"])
    weight += num(r["น้ำหนักรวม"])
    if (r["ทะเบียนรถ"]) trucks.add(String(r["ทะเบียนรถ"]))
    const byCat = (r["ค่าขนส่งแยกประเภท"] ?? {}) as Record<string, number>
    let rowRev = 0
    for (const cat of REVENUE_CATS) {
      const v = num(byCat[cat])
      rev[cat] += v
      rowRev += v
    }
    const fleet = String(r["Fleet"] ?? "(ไม่ระบุ)")
    byFleet.set(fleet, (byFleet.get(fleet) ?? 0) + rowRev)
  }
  const revTotal = REVENUE_CATS.reduce((a, c) => a + rev[c], 0)

  // MoM revenue trend across every mart month
  const trend: Array<{ monthKey: string; revenue: number; trips: number }> = []
  for (const mk of months) {
    const agg = await col
      .aggregate([
        { $match: { martKey: MART_KEY, monthKey: mk } },
        {
          $project: {
            trips: "$จำนวนเที่ยว",
            rev: {
              $sum: REVENUE_CATS.map((c) => ({ $ifNull: [`$ค่าขนส่งแยกประเภท.${c}`, 0] })),
            },
          },
        },
        { $group: { _id: null, revenue: { $sum: "$rev" }, trips: { $sum: "$trips" } } },
      ])
      .toArray()
    trend.push({ monthKey: mk, revenue: round(agg[0]?.revenue ?? 0), trips: agg[0]?.trips ?? 0 })
  }

  return NextResponse.json({
    success: true,
    data: {
      month,
      months,
      trucks: trucks.size,
      performance: { เที่ยว: trips, น้ำหนัก: round(weight) },
      revenue: {
        ค่าขนส่ง: round(rev["ค่าขนส่ง"]),
        ค่าโอนย้าย: round(rev["ค่าโอนย้าย"]),
        "ประกันรายได้ + ค่าอื่นๆ": round(rev["ประกันรายได้ + ค่าอื่นๆ"]),
        รวม: round(revTotal),
      },
      byFleet: [...byFleet.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([fleet, revenue]) => ({ fleet, revenue: round(revenue) })),
      trend,
    },
  })
}
