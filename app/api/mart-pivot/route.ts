import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { runModelQuery } from "@/lib/model/query"

const MONTH_KEY_RE = /^\d{4}-\d{2}$/

// The pivot groups the truck-summary fact up to a chosen dimension and splits
// measures into performance vs revenue. It is now a thin adapter over the
// measure engine (lib/model/query) so the numbers share one source of truth.
const GROUP_DIMS = ["ทะเบียนรถ", "ศูนย์", "Fleet", "Site", "Group Site", "เชื้อเพลิง", "Type"]
const ATTR_DIMS = ["ศูนย์", "Fleet", "Site", "เชื้อเพลิง", "Type", "fuelType"]
const PERF = ["เที่ยว", "น้ำหนัก"]
const REVENUE_CATS = ["ค่าขนส่ง", "ค่าโอนย้าย", "ประกันรายได้ + ค่าอื่นๆ"]

// GET /api/mart-pivot?martKey=truck-summary&monthKey=2026-05&groupBy=Fleet&Fleet=&Type=...
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const martKey = searchParams.get("martKey") ?? "truck-summary"
  const monthKey = searchParams.get("monthKey") ?? ""
  if (!MONTH_KEY_RE.test(monthKey)) {
    return NextResponse.json({ error: "monthKey=YYYY-MM is required" }, { status: 400 })
  }
  const groupBy = GROUP_DIMS.includes(searchParams.get("groupBy") ?? "") ? searchParams.get("groupBy")! : "Fleet"

  const filters = ATTR_DIMS.map((d) => ({ field: d, values: searchParams.get(d) ? [searchParams.get(d)!] : [] })).filter(
    (f) => f.values.length,
  )

  // When grouping by plate, also group by the truck's attributes so each row can
  // carry them (a plate has one consistent master row).
  const byPlate = groupBy === "ทะเบียนรถ"
  const dimensions = byPlate ? ["ทะเบียนรถ", ...ATTR_DIMS] : [groupBy]
  const measures = [...PERF, ...REVENUE_CATS, "รายได้รวม"]

  const client = await clientPromise
  const result = await runModelQuery(client.db(DELIVER_DB), {
    modelKey: martKey,
    monthKey,
    dimensions,
    measures,
    filters,
    sortBy: "รายได้รวม",
  })

  const shape = (dims: Record<string, string>, values: Record<string, number>, group: string) => ({
    group,
    attrs: byPlate ? Object.fromEntries(ATTR_DIMS.map((a) => [a, dims[a] ?? ""])) : {},
    perf: Object.fromEntries(PERF.map((k) => [k, values[k] ?? 0])),
    rev: Object.fromEntries(REVENUE_CATS.map((k) => [k, values[k] ?? 0])),
    revTotal: values["รายได้รวม"] ?? 0,
  })

  const pivot = result.rows.map((r) => shape(r.dims, r.values, r.dims[groupBy] ?? "(ไม่ระบุ)"))
  const total = shape({}, result.total.values, "รวมทั้งหมด")

  return NextResponse.json({
    success: true,
    data: {
      groupBy,
      groupDims: GROUP_DIMS,
      perfCols: PERF,
      revCols: REVENUE_CATS,
      rows: pivot,
      total,
      attrCols: byPlate ? ATTR_DIMS : [],
    },
  })
}
