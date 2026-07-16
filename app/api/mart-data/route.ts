import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { getMart } from "@/lib/mart/registry"
import { MART_DATA_COLLECTION } from "@/lib/mart/engine"

const MONTH_KEY_RE = /^\d{4}-\d{2}$/

// GET /api/mart-data?martKey=&monthKey=&page=&pageSize=&q=&<dimAttr>=&all=1&trend=<measure>
// Serves the fact table (paginated + filtered) plus, when trend= is set, a
// month-over-month series of the measure summed per month (for the chart).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const martKey = searchParams.get("martKey") ?? ""
  const monthKey = searchParams.get("monthKey") ?? ""
  if (!MONTH_KEY_RE.test(monthKey)) {
    return NextResponse.json({ error: "monthKey=YYYY-MM is required" }, { status: 400 })
  }
  const page = Math.max(Number(searchParams.get("page") ?? 1) || 1, 1)
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 50) || 50, 10), 200)
  const q = (searchParams.get("q") ?? "").trim()
  const wantAll = searchParams.get("all") === "1"
  const trend = searchParams.get("trend")

  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const mart = await getMart(db, martKey)
  if (!mart) return NextResponse.json({ error: "Unknown mart" }, { status: 400 })
  const col = db.collection(MART_DATA_COLLECTION)

  // Columns: grain + dims + measures (+ fuelType)
  const measureCols = mart.measures.flatMap((m) => [
    ...m.fields.map((f) => f.as),
    ...(m.countAs ? [m.countAs] : []),
  ])
  const columns = ["ทะเบียนรถ", "บริการ", ...mart.dimAttrs, "fuelType", ...measureCols]
  const numericCols = measureCols

  const base: Record<string, unknown> = { martKey, monthKey }
  const filter: Record<string, unknown> = { ...base }
  // Dimension filters: any dimAttr / fuelType passed as a query param
  for (const attr of [...mart.dimAttrs, "fuelType", "บริการ"]) {
    const v = searchParams.get(attr)
    if (v) filter[attr] = v
  }
  if (q) {
    const re = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
    filter.$or = [{ ทะเบียนรถ: re }, { บริการ: re }]
  }

  const [total, rows, ...dimValueLists] = await Promise.all([
    col.countDocuments(filter),
    col
      .find(filter, { projection: { _id: 0 } })
      .sort({ ทะเบียนรถ: 1, บริการ: 1 })
      .skip(wantAll ? 0 : (page - 1) * pageSize)
      .limit(wantAll ? 100000 : pageSize)
      .toArray(),
    ...["Fleet", "Type", "fuelType", "ศูนย์"].map((attr) => col.distinct(attr, base)),
  ])

  // Month-over-month trend for one measure (summed across the current dim filter)
  let series: Array<{ monthKey: string; value: number }> | null = null
  if (trend && measureCols.includes(trend)) {
    const trendFilter: Record<string, unknown> = { martKey }
    for (const attr of [...mart.dimAttrs, "fuelType", "บริการ"]) {
      const v = searchParams.get(attr)
      if (v) trendFilter[attr] = v
    }
    const agg = await col
      .aggregate([
        { $match: trendFilter },
        { $group: { _id: "$monthKey", value: { $sum: `$${trend}` } } },
        { $sort: { _id: 1 } },
      ])
      .toArray()
    series = agg.map((a) => ({ monthKey: a._id as string, value: Math.round((a.value as number) * 100) / 100 }))
  }

  return NextResponse.json({
    success: true,
    data: {
      mart: { martKey: mart.martKey, name: mart.name, description: mart.description },
      columns,
      numericCols,
      measureCols,
      rows,
      total,
      page,
      pageSize,
      filterOptions: {
        Fleet: (dimValueLists[0] as string[]).filter(Boolean).sort(),
        Type: (dimValueLists[1] as string[]).filter(Boolean).sort(),
        fuelType: (dimValueLists[2] as string[]).filter(Boolean).sort(),
        ศูนย์: (dimValueLists[3] as string[]).filter(Boolean).sort(),
      },
      series,
      computedAt: rows[0]?.computedAt ?? null,
    },
  })
}
