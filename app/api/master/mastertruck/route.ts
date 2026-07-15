import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"

const COLLECTION = "mastertruck"
const MAX_IMPORT_ROWS = 50000

function monthKeyToYm(monthKey: string): number | null {
  const m = monthKey.match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const month = Number(m[2])
  return month >= 1 && month <= 12 ? Number(m[1]) * 100 + month : null
}

function ymToMonthKey(ym: number): string {
  return `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, "0")}`
}

// Resolve a row's YM: numeric 202605, "202605", or "2026-05"; else fallback
function resolveYm(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 190001) return value
  if (typeof value === "string") {
    const asKey = monthKeyToYm(value.trim())
    if (asKey) return asKey
    const n = Number(value.trim())
    if (Number.isInteger(n) && n >= 190001) return n
  }
  return fallback
}

async function getPerms() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  const perms = await getUserPermissions(email)
  return { email: email ?? null, ...perms }
}

// GET /api/master/mastertruck?monthKey=2026-05|all&page=&pageSize=&q=&all=1
export async function GET(req: NextRequest) {
  const perms = await getPerms()
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const monthKey = searchParams.get("monthKey") ?? "all"
  const q = (searchParams.get("q") ?? "").trim()
  const wantAll = searchParams.get("all") === "1"
  const page = Math.max(Number(searchParams.get("page") ?? 1) || 1, 1)
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") ?? 50) || 50, 10), 200)

  const filter: Record<string, unknown> = {}
  if (monthKey !== "all") {
    const ym = monthKeyToYm(monthKey)
    if (!ym) return NextResponse.json({ error: "Invalid monthKey" }, { status: 400 })
    filter.YM = ym
  }
  if (q) {
    const re = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
    filter.$or = [{ ทะเบียนรถ: re }, { บริการ: re }, { ศูนย์: re }, { Fleet: re }, { Site: re }]
  }

  const client = await clientPromise
  const col = client.db(DELIVER_DB).collection(COLLECTION)

  const [total, yms, rows] = await Promise.all([
    col.countDocuments(filter),
    col.distinct("YM"),
    col
      .find(filter, { projection: { _id: 0 } })
      .sort({ YM: -1, ศูนย์: 1, บริการ: 1, ทะเบียนรถ: 1 })
      .skip(wantAll ? 0 : (page - 1) * pageSize)
      .limit(wantAll ? MAX_IMPORT_ROWS : pageSize)
      .toArray(),
  ])

  return NextResponse.json({
    success: true,
    data: {
      rows,
      total,
      page,
      pageSize,
      months: (yms as number[])
        .filter((y) => Number.isInteger(y))
        .sort((a, b) => b - a)
        .map(ymToMonthKey),
      isAdmin: perms.isAdmin,
    },
  })
}

// POST /api/master/mastertruck — import (admin only)
// Body: {rows: [...], defaultMonthKey: "YYYY-MM"}
// Each month-year present in the file is REPLACED (delete + insert).
export async function POST(req: NextRequest) {
  const perms = await getPerms()
  if (!perms.isAdmin) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })
  }

  const body = (await req.json()) as {
    rows?: Array<Record<string, unknown>>
    defaultMonthKey?: string
  }
  const fallbackYm = monthKeyToYm(body.defaultMonthKey ?? "")
  if (!fallbackYm) {
    return NextResponse.json({ error: "defaultMonthKey=YYYY-MM is required" }, { status: 400 })
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "ไม่มีข้อมูลใน file" }, { status: 400 })
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json({ error: `เกิน ${MAX_IMPORT_ROWS} แถว` }, { status: 400 })
  }

  const byYm = new Map<number, Array<Record<string, unknown>>>()
  for (const raw of body.rows) {
    if (raw == null || typeof raw !== "object") continue
    const row: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(raw)) {
      const key = k.trim()
      if (!key || key === "_id" || key.startsWith("__EMPTY") || key.startsWith("_imported")) continue
      row[key] = typeof v === "string" ? v.trim() : v
    }
    if (!row["ทะเบียนรถ"]) continue
    const ym = resolveYm(row["YM"], fallbackYm)
    row["YM"] = ym
    let list = byYm.get(ym)
    if (!list) {
      list = []
      byYm.set(ym, list)
    }
    list.push(row)
  }

  const client = await clientPromise
  const col = client.db(DELIVER_DB).collection(COLLECTION)
  await col.createIndex({ YM: 1 })

  const importedAt = new Date()
  const results = []
  for (const [ym, rows] of [...byYm.entries()].sort((a, b) => a[0] - b[0])) {
    const removed = await col.deleteMany({ YM: ym })
    await col.insertMany(rows.map((r) => ({ ...r, _imported_at: importedAt, _imported_by: perms.email })))
    results.push({ monthKey: ymToMonthKey(ym), removed: removed.deletedCount, inserted: rows.length })
  }

  return NextResponse.json({ success: true, data: results })
}
