import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { MART_DATA_COLLECTION } from "@/lib/mart/engine"

const MONTH_KEY_RE = /^\d{4}-\d{2}$/

// The pivot groups the raw truck-summary fact (grain = ทะเบียน × บริการ) up to a
// chosen dimension and splits measures into performance vs revenue.
const GROUP_DIMS = ["ทะเบียนรถ", "ศูนย์", "Fleet", "Site", "เชื้อเพลิง", "Type"]
const ATTR_DIMS = ["ศูนย์", "Fleet", "Site", "เชื้อเพลิง", "Type", "fuelType"]
const PERF = [
  { key: "เที่ยว", from: "จำนวนเที่ยว" },
  { key: "น้ำหนัก", from: "น้ำหนักรวม" },
]
const REVENUE_CATS = ["ค่าขนส่ง", "ค่าโอนย้าย", "ประกันรายได้ + ค่าอื่นๆ"]

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round = (n: number) => Math.round(n * 100) / 100

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

  const filter: Record<string, unknown> = { martKey, monthKey }
  for (const d of ATTR_DIMS) {
    const v = searchParams.get(d)
    if (v) filter[d] = v
  }

  const client = await clientPromise
  const rows = await client
    .db(DELIVER_DB)
    .collection(MART_DATA_COLLECTION)
    .find(filter, {
      projection: {
        _id: 0,
        [groupBy]: 1,
        ...Object.fromEntries(ATTR_DIMS.map((d) => [d, 1])),
        จำนวนเที่ยว: 1,
        น้ำหนักรวม: 1,
        ค่าขนส่งแยกประเภท: 1,
      },
    })
    .toArray()

  interface Agg {
    group: string
    attrs: Record<string, string>
    perf: Record<string, number>
    rev: Record<string, number>
    revTotal: number
  }
  const groups = new Map<string, Agg>()
  const total: Agg = { group: "รวมทั้งหมด", attrs: {}, perf: {}, rev: {}, revTotal: 0 }

  for (const r of rows) {
    const gv = String(r[groupBy] ?? "(ไม่ระบุ)") || "(ไม่ระบุ)"
    let g = groups.get(gv)
    if (!g) {
      g = { group: gv, attrs: {}, perf: {}, rev: {}, revTotal: 0 }
      // when grouping by plate, carry the truck's attributes
      if (groupBy === "ทะเบียนรถ") for (const a of ATTR_DIMS) g.attrs[a] = String(r[a] ?? "")
      groups.set(gv, g)
    }
    for (const p of PERF) {
      g.perf[p.key] = (g.perf[p.key] ?? 0) + num(r[p.from])
      total.perf[p.key] = (total.perf[p.key] ?? 0) + num(r[p.from])
    }
    const byCat = (r["ค่าขนส่งแยกประเภท"] ?? {}) as Record<string, number>
    for (const cat of REVENUE_CATS) {
      const v = num(byCat[cat])
      g.rev[cat] = (g.rev[cat] ?? 0) + v
      g.revTotal += v
      total.rev[cat] = (total.rev[cat] ?? 0) + v
      total.revTotal += v
    }
  }

  const roundAgg = (a: Agg) => ({
    group: a.group,
    attrs: a.attrs,
    perf: Object.fromEntries(Object.entries(a.perf).map(([k, v]) => [k, round(v)])),
    rev: Object.fromEntries(Object.entries(a.rev).map(([k, v]) => [k, round(v)])),
    revTotal: round(a.revTotal),
  })

  const pivot = [...groups.values()].sort((a, b) => b.revTotal - a.revTotal).map(roundAgg)

  return NextResponse.json({
    success: true,
    data: {
      groupBy,
      groupDims: GROUP_DIMS,
      perfCols: PERF.map((p) => p.key),
      revCols: REVENUE_CATS,
      rows: pivot,
      total: roundAgg(total),
      attrCols: groupBy === "ทะเบียนรถ" ? ATTR_DIMS : [],
    },
  })
}
