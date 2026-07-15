import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { getFlow } from "@/lib/etl/flows"

const MONTH_KEY_RE = /^\d{4}-\d{2}$/

// GET /api/etl/data?flowKey=&monthKey=&page=&pageSize= — paginated raw rows
// from a dynamic flow's target collection. Display only.
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
  const wantAll = searchParams.get("all") === "1" // export: full month slice

  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const flow = await getFlow(db, searchParams.get("flowKey") ?? "")
  if (!flow || !flow.dynamic) {
    return NextResponse.json({ error: "Unknown dynamic flow" }, { status: 400 })
  }

  const q = (searchParams.get("q") ?? "").trim()
  const filter: Record<string, unknown> = { monthKey }
  if (q) {
    const re = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
    filter.$or = flow.columns.map((c) => ({ [c]: re }))
  }

  const col = db.collection(flow.targetCollection)
  const [total, rows] = await Promise.all([
    col.countDocuments(filter),
    col
      .find(filter, { projection: { _id: 0 } })
      .skip(wantAll ? 0 : (page - 1) * pageSize)
      .limit(wantAll ? 100000 : pageSize)
      .toArray(),
  ])

  // Display columns: month meta first, then the flow's configured columns
  const columns = [
    ...(flow.monthField && !flow.columns.includes(flow.monthField) ? [flow.monthField] : []),
    ...(flow.dedupeField && !flow.columns.includes(flow.dedupeField) ? [flow.dedupeField] : []),
    ...flow.columns,
  ]

  return NextResponse.json({
    success: true,
    data: {
      flow: {
        flowKey: flow.flowKey,
        name: flow.name,
        description: flow.description,
        targetCollection: flow.targetCollection,
      },
      columns,
      rows,
      total,
      page,
      pageSize,
      computedAt: rows[0]?.computedAt ?? null,
      rulesVersion: rows[0]?.rulesVersion ?? null,
    },
  })
}
