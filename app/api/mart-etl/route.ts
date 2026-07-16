import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { RUNS_COLLECTION } from "@/lib/etl/flows"
import { runEtlMonths } from "@/lib/etl/run-log"
import { getMart } from "@/lib/mart/registry"
import {
  buildMonthMart,
  ymToMonthKey,
  MART_DATA_COLLECTION,
  DIM_TRUCK,
  DIM_FLEET,
  DIM_SERVICE,
  DIM_MONTH,
} from "@/lib/mart/engine"

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

function monthKeyToYm(key: string): number | null {
  const m = key.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const mm = Number(m[2])
  return mm >= 1 && mm <= 12 ? Number(m[1]) * 100 + mm : null
}

// POST /api/mart-etl { martKey, from, to }  (or { martKey, ym: 202605 })
export async function POST(req: NextRequest) {
  const triggeredBy = await authorizedAs(req)
  if (!triggeredBy) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as {
    martKey?: string
    from?: string
    to?: string
  }

  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const mart = await getMart(db, body.martKey ?? "")
  if (!mart) return NextResponse.json({ error: "Unknown mart" }, { status: 400 })

  const fromYm = monthKeyToYm(body.from ?? "")
  const toYm = monthKeyToYm(body.to ?? "")
  if (!fromYm || !toYm) {
    return NextResponse.json({ error: "from/to monthKey (YYYY-MM) required" }, { status: 400 })
  }
  const months: Array<{ year: number; month: number }> = []
  const d = new Date(Date.UTC(Math.floor(fromYm / 100), (fromYm % 100) - 1, 1))
  const end = Date.UTC(Math.floor(toYm / 100), (toYm % 100) - 1, 1)
  while (d.getTime() <= end && months.length <= 36) {
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 })
    d.setUTCMonth(d.getUTCMonth() + 1)
  }

  const factCol = db.collection(MART_DATA_COLLECTION)
  await factCol.createIndex({ martKey: 1, monthKey: 1 })
  await db.collection(DIM_TRUCK).createIndex({ YM: 1, ทะเบียนรถ: 1 })
  await db.collection(DIM_FLEET).createIndex({ YM: 1, fleetKey: 1 })
  await db.collection(DIM_MONTH).createIndex({ YM: 1 })

  const results = await runEtlMonths(db, {
    flowKey: `mart:${mart.martKey}`,
    months,
    triggeredBy,
    monthKeyOf: (y, m) => ymToMonthKey(y * 100 + m),
    processMonth: async (year, month, startedAt) => {
      const ym = year * 100 + month
      const { monthKey, facts, dims, matchRates, grainRows } = await buildMonthMart(db, mart, ym)
      const computedAt = new Date()

      // ── Idempotent per-mart / per-month replace of the fact ──
      await factCol.deleteMany({ martKey: mart.martKey, monthKey })
      for (let i = 0; i < facts.length; i += INSERT_BATCH) {
        await factCol.insertMany(facts.slice(i, i + INSERT_BATCH).map((f) => ({ ...f, computedAt })))
      }

      // ── Conformed dimensions (shared across marts, keyed by month) ──
      await db.collection(DIM_MONTH).replaceOne({ YM: ym }, dims.month, { upsert: true })
      await db.collection(DIM_FLEET).deleteMany({ YM: ym })
      if (dims.fleet.length) await db.collection(DIM_FLEET).insertMany(dims.fleet)
      await db.collection(DIM_TRUCK).deleteMany({ YM: ym })
      if (dims.truck.length) await db.collection(DIM_TRUCK).insertMany(dims.truck)
      await db.collection(DIM_SERVICE).deleteMany({ YM: ym })
      if (dims.service.length)
        await db.collection(DIM_SERVICE).insertMany(dims.service.map((s) => ({ ...s, YM: ym })))

      // Match-rate is the mart's data-quality signal (there is no cut identity).
      // Flag any source that hit no grain cells — a likely broken join.
      const brokenJoins = Object.entries(matchRates)
        .filter(([, m]) => m.sourceRows > 0 && m.grainHit === 0)
        .map(([s]) => s)

      await db.collection(RUNS_COLLECTION).insertOne({
        flowKey: `mart:${mart.martKey}`,
        martKey: mart.martKey,
        monthKey,
        status: brokenJoins.length ? "error" : "success",
        error: brokenJoins.length ? `join produced 0 matches for: ${brokenJoins.join(", ")}` : undefined,
        trips: facts.length,
        grainRows,
        matchRates,
        triggeredBy,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      })

      return { rows: facts.length, grainRows, matchRates }
    },
  })

  return NextResponse.json({ success: true, data: results })
}
