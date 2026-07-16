import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { buildMonthSnapshot, SUMMARY_DATA_COLLECTION } from "@/lib/summary/snapshot"
import { DELIVER_DB } from "@/lib/trip-count/source"

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

function parseMonthKeyToYm(key: string): number | null {
  const m = key.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  return month >= 1 && month <= 12 ? year * 100 + month : null
}

function nextYm(ym: number): number {
  const month = ym % 100
  return month === 12 ? (Math.floor(ym / 100) + 1) * 100 + 1 : ym + 1
}

function targetYms(body: { from?: string; to?: string; months?: number }): number[] | null {
  if (body.from && body.to) {
    const from = parseMonthKeyToYm(body.from)
    const to = parseMonthKeyToYm(body.to)
    if (!from || !to || from > to) return null
    const list: number[] = []
    let ym = from
    while (ym <= to && list.length <= 36) {
      list.push(ym)
      ym = nextYm(ym)
    }
    return list
  }
  const months = Math.min(Math.max(body.months ?? 3, 1), 36)
  const now = new Date()
  const list: number[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    list.push(d.getUTCFullYear() * 100 + d.getUTCMonth() + 1)
  }
  return list.reverse()
}

export async function POST(req: NextRequest) {
  const triggeredBy = await authorizedAs(req)
  if (!triggeredBy) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { from?: string; to?: string; months?: number } = {}
  try {
    body = await req.json()
  } catch {
    // empty body → defaults
  }

  const yms = targetYms(body)
  if (!yms) {
    return NextResponse.json({ error: "Invalid from/to monthKey (YYYY-MM)" }, { status: 400 })
  }

  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const col = db.collection(SUMMARY_DATA_COLLECTION)

  await col.createIndex({ monthKey: 1 })
  await col.createIndex({ monthKey: 1, ทะเบียนรถ: 1 })

  const results = []
  for (const ym of yms) {
    const startedAt = new Date()
    const { monthKey, docs, trucks, weightMatched, costMatched } = await buildMonthSnapshot(db, ym)

    await col.deleteMany({ monthKey })
    for (let i = 0; i < docs.length; i += INSERT_BATCH) {
      const batch = docs.slice(i, i + INSERT_BATCH)
      if (batch.length > 0) await col.insertMany(batch)
    }

    results.push({
      monthKey,
      trucks,
      inserted: docs.length,
      weightMatched,
      costMatched,
      durationMs: Date.now() - startedAt.getTime(),
    })
  }

  return NextResponse.json({ success: true, data: results })
}
