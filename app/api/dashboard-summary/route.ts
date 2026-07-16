import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { MART_DATA_COLLECTION } from "@/lib/mart/engine"
import { runModelQuery } from "@/lib/model/query"

const MART_KEY = "truck-summary"
const round = (n: number) => Math.round(n * 100) / 100

// GET /api/dashboard-summary — executive KPIs for the latest available month:
// Performance (เที่ยว, น้ำหนัก), Revenue (3 categories + ratios), revenue by
// Fleet, and a month-over-month trend. All computed by the measure engine.
export async function GET() {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const col = db.collection(MART_DATA_COLLECTION)

  const months = (await col.distinct("monthKey", { martKey: MART_KEY })).sort()
  if (!months.length) {
    return NextResponse.json({ success: true, data: { month: null, months: [] } })
  }
  const month = months[months.length - 1]

  // Grand totals + ratios for the latest month.
  const totals = await runModelQuery(db, {
    monthKey: month,
    dimensions: [],
    measures: ["เที่ยว", "น้ำหนัก", "ค่าขนส่ง", "ค่าโอนย้าย", "ประกันรายได้ + ค่าอื่นๆ", "รายได้รวม", "บาท/เที่ยว", "น้ำหนัก/เที่ยว"],
  })
  const t = totals.total.values

  // Revenue by Fleet.
  const byFleetQ = await runModelQuery(db, {
    monthKey: month,
    dimensions: ["Fleet"],
    measures: ["รายได้รวม"],
    sortBy: "รายได้รวม",
  })

  const trucks = (await col.distinct("ทะเบียนรถ", { martKey: MART_KEY, monthKey: month })).filter(Boolean).length

  // MoM trend across every mart month.
  const trend: Array<{ monthKey: string; revenue: number; trips: number }> = []
  for (const mk of months) {
    const q = await runModelQuery(db, { monthKey: mk, dimensions: [], measures: ["รายได้รวม", "เที่ยว"] })
    trend.push({ monthKey: mk, revenue: q.total.values["รายได้รวม"] ?? 0, trips: q.total.values["เที่ยว"] ?? 0 })
  }

  return NextResponse.json({
    success: true,
    data: {
      month,
      months,
      trucks,
      performance: { เที่ยว: t["เที่ยว"] ?? 0, น้ำหนัก: t["น้ำหนัก"] ?? 0 },
      revenue: {
        ค่าขนส่ง: t["ค่าขนส่ง"] ?? 0,
        ค่าโอนย้าย: t["ค่าโอนย้าย"] ?? 0,
        "ประกันรายได้ + ค่าอื่นๆ": t["ประกันรายได้ + ค่าอื่นๆ"] ?? 0,
        รวม: t["รายได้รวม"] ?? 0,
      },
      ratios: {
        "บาท/เที่ยว": round(t["บาท/เที่ยว"] ?? 0),
        "น้ำหนัก/เที่ยว": round(t["น้ำหนัก/เที่ยว"] ?? 0),
      },
      byFleet: byFleetQ.rows.map((r) => ({ fleet: r.dims["Fleet"] ?? "(ไม่ระบุ)", revenue: r.values["รายได้รวม"] ?? 0 })),
      trend,
    },
  })
}
