import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { SOURCES } from "@/lib/etl/flows"

const HIDDEN_FIELDS = new Set(["_id", "_synced_at", "_file_id"])

// GET /api/etl/sources — datasource whitelist with discovered fields + recent stats.
// Field discovery samples the 50 most recently inserted docs (cheap, indexed-free
// on a small limit) and unions their keys.
export async function GET() {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const client = await clientPromise
  const db = client.db(DELIVER_DB)

  const now = new Date()
  const recentMonths = [0, 1, 2].map((i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  })

  const sources = []
  for (const [collection, meta] of Object.entries(SOURCES)) {
    const col = db.collection(collection)
    const [sample, months, lastSync] = await Promise.all([
      col.find({}, { sort: { _id: -1 }, limit: 50 }).toArray(),
      Promise.all(
        recentMonths.map(async ({ year, month }) => ({
          monthKey: `${year}-${String(month).padStart(2, "0")}`,
          rows: await col.countDocuments({ _year: year, _month: month }),
        }))
      ),
      db
        .collection("pipeline_runs")
        .find({ pipeline: meta.pipeline })
        .sort({ created_at: -1 })
        .limit(1)
        .toArray(),
    ])

    const fields = new Set<string>()
    for (const doc of sample) {
      for (const key of Object.keys(doc)) {
        if (!HIDDEN_FIELDS.has(key)) fields.add(key)
      }
    }

    sources.push({
      collection,
      label: meta.label,
      fields: [...fields],
      months,
      lastSync: lastSync[0]?.created_at ?? null,
      empty: sample.length === 0,
    })
  }

  return NextResponse.json({ success: true, data: sources })
}
