import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { SUMMARY_DATA_COLLECTION } from "@/lib/summary/snapshot"
import { DELIVER_DB } from "@/lib/trip-count/source"

const MONTH_KEY_RE = /^\d{4}-\d{2}$/

// GET /api/summary-data?monthKey=&page=&pageSize=&fleet=&center=&service=&q=&all=1
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const monthKey = searchParams.get("monthKey") ?? ""
  if (!MONTH_KEY_RE.test(monthKey)) {
    return NextResponse.json({ error: "monthKey=YYYY-MM is required" }, { status: 400 })
  }

  const page = Math.max(Number(searchParams.get("page") ?? 1) || 1, 1)
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 50) || 50, 10), 500)
  const fleet = searchParams.get("fleet")
  const center = searchParams.get("center")
  const service = searchParams.get("service")
  const q = (searchParams.get("q") ?? "").trim()
  const wantAll = searchParams.get("all") === "1"

  const monthFilter: Record<string, unknown> = { monthKey }
  const filter: Record<string, unknown> = { ...monthFilter }
  if (fleet) filter["Fleet"] = fleet
  if (center) filter["ศูนย์"] = center
  if (service) filter["บริการ"] = service
  if (q) {
    const re = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
    filter.$or = [{ ทะเบียนรถ: re }, { Fleet: re }, { ศูนย์: re }, { บริการ: re }]
  }

  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const col = db.collection(SUMMARY_DATA_COLLECTION)

  const [total, fleets, centers, services, rows] = await Promise.all([
    col.countDocuments(filter),
    col.distinct("Fleet", monthFilter),
    col.distinct("ศูนย์", monthFilter),
    col.distinct("บริการ", monthFilter),
    col
      .find(filter, { projection: { _id: 0 } })
      .sort({ ศูนย์: 1, บริการ: 1, ทะเบียนรถ: 1 })
      .skip(wantAll ? 0 : (page - 1) * pageSize)
      .limit(wantAll ? 100000 : pageSize)
      .toArray(),
  ])

  return NextResponse.json({
    success: true,
    data: {
      rows,
      total,
      page,
      pageSize,
      fleets: (fleets as Array<string | null>).filter(Boolean).sort(),
      centers: (centers as Array<string | null>).filter(Boolean).sort(),
      services: (services as Array<string | null>).filter(Boolean).sort(),
      snapshotAt: rows[0]?.snapshotAt ?? null,
    },
  })
}
