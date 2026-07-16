import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { RUNS_COLLECTION, getFlow } from "@/lib/etl/flows"
import { buildFlowMonthData, fetchFlowRows } from "@/lib/etl/executor"
import { getRuleDoc } from "@/lib/etl/rules-store"
import { reconcile, runEtlMonths } from "@/lib/etl/run-log"
import { monthKeyOf } from "@/lib/trip-count/calculate"

export const maxDuration = 300

const INSERT_BATCH = 2000

async function authorizedAs(req: NextRequest): Promise<string | null> {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get("x-cron-secret") === cronSecret) return "cron"

  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  const perms = await getUserPermissions(email)
  return perms.isAdmin || perms.allowedGroups.includes("bi") ? (email ?? null) : null
}

function parseMonthKey(key: string): { year: number; month: number } | null {
  const m = key.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  return month >= 1 && month <= 12 ? { year, month } : null
}

function monthRange(from: string, to: string) {
  const f = parseMonthKey(from)
  const t = parseMonthKey(to)
  if (!f || !t) return null
  const list: Array<{ year: number; month: number }> = []
  const d = new Date(Date.UTC(f.year, f.month - 1, 1))
  const end = Date.UTC(t.year, t.month - 1, 1)
  while (d.getTime() <= end && list.length <= 36) {
    list.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
    d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return list
}

// POST /api/etl/run {flowKey, from, to} — generic executor for dynamic flows.
// (The trip flow keeps its dedicated /api/trip-etl route.)
export async function POST(req: NextRequest) {
  const triggeredBy = await authorizedAs(req)
  if (!triggeredBy) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await req.json()) as { flowKey?: string; from?: string; to?: string }
  const client = await clientPromise
  const db = client.db(DELIVER_DB)

  const flow = await getFlow(db, body.flowKey ?? "")
  if (!flow) return NextResponse.json({ error: "Unknown flow" }, { status: 400 })
  if (!flow.dynamic) {
    return NextResponse.json({ error: "Static flow — ใช้ endpoint เฉพาะของ flow นั้น" }, { status: 400 })
  }

  const months = monthRange(body.from ?? "", body.to ?? "")
  if (!months) {
    return NextResponse.json({ error: "Invalid from/to monthKey (YYYY-MM)" }, { status: 400 })
  }

  const targetCol = db.collection(flow.targetCollection)
  await targetCol.createIndex({ monthKey: 1 })

  const ruleDoc = await getRuleDoc(db, flow.flowKey)

  const results = await runEtlMonths(db, {
    flowKey: flow.flowKey,
    months,
    triggeredBy,
    monthKeyOf,
    processMonth: async (year, month, startedAt) => {
      const rows = await fetchFlowRows(db, flow, year, month)
      const { monthKey, candidates, docs, excluded } = buildFlowMonthData(
        rows,
        flow,
        ruleDoc.rules,
        year,
        month
      )
      reconcile(candidates, docs.length, excluded.total)
      const computedAt = new Date()

      // Idempotent: replace the whole month-year slice
      await targetCol.deleteMany({ monthKey })
      for (let i = 0; i < docs.length; i += INSERT_BATCH) {
        await targetCol.insertMany(
          docs.slice(i, i + INSERT_BATCH).map((d) => ({
            ...d,
            rulesVersion: ruleDoc.version,
            computedAt,
          }))
        )
      }

      await db.collection(RUNS_COLLECTION).insertOne({
        flowKey: flow.flowKey,
        monthKey,
        status: "success",
        rulesVersion: ruleDoc.version,
        rowsScanned: rows.length,
        uniqueLdt: candidates,
        trips: docs.length,
        excluded: excluded.total,
        excludedByRule: excluded.byRule,
        triggeredBy,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      })

      return {
        rulesVersion: ruleDoc.version,
        rowsScanned: rows.length,
        candidates,
        kept: docs.length,
        excluded: excluded.total,
        excludedByRule: excluded.byRule,
      }
    },
  })

  return NextResponse.json({ success: true, data: results })
}
