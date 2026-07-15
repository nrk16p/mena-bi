import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { getAllFlows, RUNS_COLLECTION } from "@/lib/etl/flows"
import { getRuleDoc } from "@/lib/etl/rules-store"

// GET /api/etl/overview — 3-pillar status for every registered flow.
// Only cheap indexed counts/lookups; no heavy computation.
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

  const flows = []
  for (const flow of await getAllFlows(db)) {
    const sourceCol = db.collection(flow.sourceCollection)
    const targetCol = db.collection(flow.targetCollection)

    const [lastSync, sourceMonths, ruleDoc, lastRuns, targetMonthKeys] = await Promise.all([
      db
        .collection("pipeline_runs")
        .find({ pipeline: flow.sourcePipeline })
        .sort({ created_at: -1 })
        .limit(1)
        .toArray(),
      Promise.all(
        recentMonths.map(async ({ year, month }) => ({
          monthKey: `${year}-${String(month).padStart(2, "0")}`,
          rows: await sourceCol.countDocuments({ _year: year, _month: month }),
        }))
      ),
      getRuleDoc(db, flow.flowKey),
      db
        .collection(RUNS_COLLECTION)
        .find({ flowKey: flow.flowKey }, { projection: { _id: 0 } })
        .sort({ finishedAt: -1 })
        .limit(5)
        .toArray(),
      targetCol.distinct("monthKey"),
    ])

    const targetMonths = await Promise.all(
      targetMonthKeys
        .sort()
        .reverse()
        .slice(0, 6)
        .map(async (mk) => ({
          monthKey: mk as string,
          rows: await targetCol.countDocuments({ monthKey: mk }),
        }))
    )

    flows.push({
      flowKey: flow.flowKey,
      name: flow.name,
      description: flow.description,
      source: {
        collection: flow.sourceCollection,
        href: flow.sourceHref,
        lastSync: lastSync[0]?.created_at ?? null,
        months: sourceMonths,
      },
      conditions: {
        href: flow.conditionsHref,
        version: ruleDoc.version,
        totalRules: ruleDoc.rules.length,
        activeRules: ruleDoc.rules.filter((r) => r.enabled).length,
        updatedAt: ruleDoc.updatedAt ?? null,
        updatedBy: ruleDoc.updatedBy ?? null,
        lastRuns,
      },
      target: {
        collection: flow.targetCollection,
        href: flow.targetHref,
        monthsLoaded: targetMonthKeys.length,
        months: targetMonths,
      },
    })
  }

  return NextResponse.json({ success: true, data: flows })
}
