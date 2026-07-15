import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { COST_DATA_COLLECTION, DELIVER_DB } from "@/lib/trip-count/source"
import { RUNS_COLLECTION } from "@/lib/etl/flows"

const MONTH_KEY_RE = /^\d{4}-\d{2}$/

// GET /api/cost-data?monthKey=&page=&pageSize=&category=&service=&branch=&zone=&q=&all=1
// Raw post-cut charge rows — display only. Category totals come from the ETL
// run log (computed at ETL time; no aggregation on read).
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
  const category = searchParams.get("category")
  const service = searchParams.get("service")
  const branch = searchParams.get("branch")
  const zone = searchParams.get("zone")
  const q = (searchParams.get("q") ?? "").trim()
  const wantAll = searchParams.get("all") === "1"

  const monthFilter = { monthKey }
  const filter: Record<string, unknown> = { ...monthFilter }
  if (category) filter.category = category
  if (service) filter.service = service
  if (branch) filter.branch = branch
  if (zone) filter.zone = zone
  if (q) {
    const re = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
    filter.$or = [{ ldt: re }, { subcode: re }, { plateHead: re }]
  }

  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const col = db.collection(COST_DATA_COLLECTION)

  const [total, categories, services, branches, zones, rows, lastRun] = await Promise.all([
    col.countDocuments(filter),
    col.distinct("category", monthFilter),
    col.distinct("service", monthFilter),
    col.distinct("branch", monthFilter),
    col.distinct("zone", monthFilter),
    col
      .find(filter, { projection: { _id: 0 } })
      .sort({ category: 1, service: 1, ldt: 1 })
      .skip(wantAll ? 0 : (page - 1) * pageSize)
      .limit(wantAll ? 100000 : pageSize)
      .toArray(),
    db
      .collection(RUNS_COLLECTION)
      .find({ flowKey: "transport-cost", monthKey })
      .sort({ finishedAt: -1 })
      .limit(1)
      .toArray(),
  ])

  return NextResponse.json({
    success: true,
    data: {
      rows,
      total,
      page,
      pageSize,
      categories: (categories as Array<string | null>).filter(Boolean).sort(),
      services: (services as Array<string | null>).filter(Boolean).sort(),
      branches: (branches as Array<string | null>).filter(Boolean).sort(),
      zones: (zones as Array<string | null>).filter(Boolean).sort(),
      totalAmount: lastRun[0]?.totalAmount ?? null,
      byCategory: lastRun[0]?.byCategory ?? null,
      computedAt: rows[0]?.computedAt ?? null,
      rulesVersion: rows[0]?.rulesVersion ?? null,
    },
  })
}
