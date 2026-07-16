import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { buildMonthDriverCosts, monthKeyOf } from "@/lib/trip-count/calculate"
import { DELIVER_DB, DRIVER_COST_DATA_COLLECTION, fetchDriverCostRows } from "@/lib/trip-count/source"
import { getRuleDoc } from "@/lib/etl/rules-store"
import { RUNS_COLLECTION } from "@/lib/etl/flows"
import { reconcile, runEtlMonths } from "@/lib/etl/run-log"

export const maxDuration = 300

const INSERT_BATCH = 2000
const FLOW_KEY = "driver-cost"

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

function targetMonths(body: { months?: number; from?: string; to?: string }) {
  if (body.from && body.to) {
    const from = parseMonthKey(body.from)
    const to = parseMonthKey(body.to)
    if (!from || !to) return null
    const list: Array<{ year: number; month: number }> = []
    const d = new Date(Date.UTC(from.year, from.month - 1, 1))
    const end = Date.UTC(to.year, to.month - 1, 1)
    while (d.getTime() <= end && list.length <= 36) {
      list.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
      d.setUTCMonth(d.getUTCMonth() + 1)
    }
    return list
  }

  const months = Math.min(Math.max(body.months ?? 3, 1), 36)
  const now = new Date()
  const list: Array<{ year: number; month: number }> = []
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    list.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
  }
  return list.reverse()
}

export async function POST(req: NextRequest) {
  const triggeredBy = await authorizedAs(req)
  if (!triggeredBy) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { months?: number; from?: string; to?: string } = {}
  try {
    body = await req.json()
  } catch {
    // empty body → defaults
  }

  const months = targetMonths(body)
  if (!months) {
    return NextResponse.json({ error: "Invalid from/to monthKey (YYYY-MM)" }, { status: 400 })
  }

  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const col = db.collection(DRIVER_COST_DATA_COLLECTION)
  await col.createIndex({ monthKey: 1 })
  await col.createIndex({ monthKey: 1, partnerType: 1 })

  const ruleDoc = await getRuleDoc(db, FLOW_KEY)

  const results = await runEtlMonths(db, {
    flowKey: FLOW_KEY,
    months,
    triggeredBy,
    monthKeyOf,
    processMonth: async (year, month, startedAt) => {
      const rows = await fetchDriverCostRows(db, year, month)
      const { monthKey, rowsInMonth, docs, totalFee, byPartnerType, excluded } = buildMonthDriverCosts(
        rows,
        year,
        month,
        ruleDoc.rules
      )
      reconcile(rowsInMonth, docs.length, excluded.total)
      const computedAt = new Date()

      // Idempotent: replace the whole month-year slice
      await col.deleteMany({ monthKey })
      for (let i = 0; i < docs.length; i += INSERT_BATCH) {
        await col.insertMany(
          docs.slice(i, i + INSERT_BATCH).map((d) => ({
            ...d,
            rulesVersion: ruleDoc.version,
            computedAt,
          }))
        )
      }

      await db.collection(RUNS_COLLECTION).insertOne({
        flowKey: FLOW_KEY,
        monthKey,
        status: "success",
        rulesVersion: ruleDoc.version,
        rowsScanned: rows.length,
        uniqueLdt: rowsInMonth,
        trips: docs.length,
        totalFee,
        byPartnerType,
        excluded: excluded.total,
        excludedByRule: excluded.byRule,
        triggeredBy,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      })

      return {
        rulesVersion: ruleDoc.version,
        rowsInMonth,
        rowsKept: docs.length,
        totalFee,
        byPartnerType,
        excluded: excluded.total,
        excludedByRule: excluded.byRule,
      }
    },
  })

  return NextResponse.json({ success: true, data: results })
}
