import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { MART_DATA_COLLECTION } from "@/lib/mart/engine"
import { runModelQuery } from "@/lib/model/query"

const MONTH_KEY_RE = /^\d{4}-\d{2}$/

// The pivot groups the truck-summary fact up to a chosen dimension and splits
// measures into performance vs revenue. It is now a thin adapter over the
// measure engine (lib/model/query) so the numbers share one source of truth.
const GROUP_DIMS = ["ทะเบียนรถ", "ศูนย์", "Fleet", "Site", "Group Site", "Plant", "เชื้อเพลิง", "Type"]
const ATTR_DIMS = ["ศูนย์", "Fleet", "Site", "Plant", "เชื้อเพลิง", "Type", "fuelType"]
// Dimensions the user can slice the pivot by (each becomes a filter dropdown).
const FILTER_DIMS = ["ทะเบียนรถ", "บริการ", "ศูนย์", "Fleet", "Site", "Group Site", "Plant", "เชื้อเพลิง", "Type"]
const PERF = ["เที่ยว", "น้ำหนัก"]
const REVENUE_CATS = ["ค่าขนส่ง", "ค่าโอนย้าย", "ประกันรายได้ + ค่าอื่นๆ"]
// Cost tier: display key → semantic measure key
const COST = [
  { key: "ค่าเที่ยว", measure: "ค่าเที่ยวรวม" },
  { key: "ค่าเชื้อเพลิง", measure: "ค่าเชื้อเพลิง" },
]

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

  const filters = FILTER_DIMS.map((d) => ({ field: d, values: searchParams.get(d) ? [searchParams.get(d)!] : [] })).filter(
    (f) => f.values.length,
  )

  // When grouping by plate, also group by the truck's attributes so each row can
  // carry them (a plate has one consistent master row).
  const byPlate = groupBy === "ทะเบียนรถ"
  const dimensions = byPlate ? ["ทะเบียนรถ", ...ATTR_DIMS] : [groupBy]
  const measures = [...PERF, ...REVENUE_CATS, "รายได้รวม", ...COST.map((c) => c.measure)]

  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const result = await runModelQuery(db, {
    modelKey: martKey,
    monthKey,
    dimensions,
    measures,
    filters,
    sortBy: "รายได้รวม",
  })

  // Distinct values per filter dimension — cascading: each dimension's options
  // reflect the OTHER active filters (not its own), so the dropdowns respond to
  // the data actually available under the current selection.
  const col = db.collection(MART_DATA_COLLECTION)
  const active: Record<string, string> = {}
  for (const d of FILTER_DIMS) {
    const v = searchParams.get(d)
    if (v) active[d] = v
  }
  const optEntries = await Promise.all(
    FILTER_DIMS.map(async (d) => {
      const q: Record<string, string> = { martKey, monthKey }
      for (const [f, v] of Object.entries(active)) if (f !== d) q[f] = v
      const vals = await col.distinct(d, q)
      return [d, vals.filter((v) => v != null && v !== "").map(String).sort((a, b) => a.localeCompare(b, "th"))] as const
    }),
  )
  const filterOptions = Object.fromEntries(optEntries)

  const shape = (dims: Record<string, string>, values: Record<string, number>, group: string) => ({
    group,
    attrs: byPlate ? Object.fromEntries(ATTR_DIMS.map((a) => [a, dims[a] ?? ""])) : {},
    perf: Object.fromEntries(PERF.map((k) => [k, values[k] ?? 0])),
    rev: Object.fromEntries(REVENUE_CATS.map((k) => [k, values[k] ?? 0])),
    revTotal: values["รายได้รวม"] ?? 0,
    cost: Object.fromEntries(COST.map((c) => [c.key, values[c.measure] ?? 0])),
  })

  const pivot = result.rows.map((r) => shape(r.dims, r.values, r.dims[groupBy] ?? "(ไม่ระบุ)"))
  const total = shape({}, result.total.values, "รวมทั้งหมด")

  return NextResponse.json({
    success: true,
    data: {
      groupBy,
      groupDims: GROUP_DIMS,
      filterDims: FILTER_DIMS,
      filterOptions,
      perfCols: PERF,
      revCols: REVENUE_CATS,
      costCols: COST.map((c) => c.key),
      rows: pivot,
      total,
      attrCols: byPlate ? ATTR_DIMS : [],
    },
  })
}
