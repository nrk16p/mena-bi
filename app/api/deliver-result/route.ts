import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB, DELIVER_COLLECTION } from "@/lib/trip-count/source"

// Columns exposed to the datasource table (subset of the ~70 Excel columns)
const COLUMNS = [
  "ออก LDT",
  "LDT",
  "บริการ",
  "subcode",
  "โซน",
  "ชื่อshipto",
  "จังหวัด",
  "เลขรถ",
  "หัว",
  "หาง",
  "พจส",
  "ประเภทรถร่วม",
  "ค่าจัดส่ง",
  "สถานะตั๋ว",
  "_branch",
] as const

// GET /api/deliver-result?monthKey=2026-06&page=1&pageSize=50&branch=&service=&zone=&q=
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const monthKey = searchParams.get("monthKey") ?? ""
  const m = monthKey.match(/^(\d{4})-(\d{2})$/)
  if (!m) {
    return NextResponse.json({ error: "monthKey=YYYY-MM is required" }, { status: 400 })
  }
  const page = Math.max(Number(searchParams.get("page") ?? 1) || 1, 1)
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 50) || 50, 10), 200)
  const branch = searchParams.get("branch")
  const service = searchParams.get("service")
  const zone = searchParams.get("zone")
  const q = (searchParams.get("q") ?? "").trim()

  const monthFilter = { _year: Number(m[1]), _month: Number(m[2]) }
  const filter: Record<string, unknown> = { ...monthFilter }
  if (branch) filter._branch = branch
  if (service) filter["บริการ"] = service
  if (zone) filter["โซน"] = zone
  if (q) {
    const re = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
    filter.$or = [{ LDT: re }, { subcode: re }, { ชื่อshipto: re }, { หัว: re }, { หาง: re }, { เลขรถ: re }]
  }

  const client = await clientPromise
  const col = client.db(DELIVER_DB).collection(DELIVER_COLLECTION)

  const projection = Object.fromEntries([["_id", 0], ...COLUMNS.map((c) => [c, 1])])
  const [total, branches, services, zones, rows] = await Promise.all([
    col.countDocuments(filter),
    col.distinct("_branch", monthFilter),
    col.distinct("บริการ", monthFilter),
    col.distinct("โซน", monthFilter),
    col
      .find(filter, { projection })
      .sort({ _branch: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ])

  return NextResponse.json({
    success: true,
    data: {
      columns: COLUMNS,
      rows,
      total,
      page,
      pageSize,
      branches: branches.sort(),
      services: (services as Array<string | null>).filter(Boolean).sort(),
      zones: (zones as Array<string | null>).filter(Boolean).sort(),
    },
  })
}
