import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB, TRIP_DATA_COLLECTION } from "@/lib/trip-count/source"

const MONTH_KEY_RE = /^\d{4}-\d{2}$/

// GET /api/trip-data?monthKey=2026-06&page=1&pageSize=50&service=...
// Reads the stored raw trip rows (post-cut) — display only, no computation.
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
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 50) || 50, 10), 200)
  const service = searchParams.get("service")

  const monthFilter = { monthKey }
  const filter = service ? { ...monthFilter, service } : monthFilter

  const client = await clientPromise
  const col = client.db(DELIVER_DB).collection(TRIP_DATA_COLLECTION)

  const [total, services, rows] = await Promise.all([
    col.countDocuments(filter),
    col.distinct("service", monthFilter),
    col
      .find(filter, { projection: { _id: 0 } })
      .sort({ service: 1, ldtBase: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ])

  return NextResponse.json({
    success: true,
    data: {
      rows,
      total,
      page,
      pageSize,
      services: services.sort(),
      computedAt: rows[0]?.computedAt ?? null,
    },
  })
}
