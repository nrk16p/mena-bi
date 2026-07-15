import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB, fetchDeliverRows } from "@/lib/trip-count/source"
import { buildMonthCosts, buildMonthTrips, buildMonthWeights } from "@/lib/trip-count/calculate"
import { validateRules } from "@/lib/etl/engine"
import { SOURCES, STATIC_FLOWS, getFlow, toFlowConfig, type FlowConfig } from "@/lib/etl/flows"
import { buildFlowMonthData, fetchFlowRows } from "@/lib/etl/executor"

export const maxDuration = 300

interface DraftFlow {
  sourceCollection?: string
  monthField?: string | null
  dedupeField?: string | null
  columns?: string[]
}

// POST /api/etl/preview — dry-run rules against one month, writes nothing.
// Body: {flowKey, monthKey, rules} for an existing flow, or
//       {draft: {sourceCollection, monthField, dedupeField, columns}, monthKey, rules}
//       for a flow being built in the wizard.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = (await req.json()) as {
    flowKey?: string
    draft?: DraftFlow
    monthKey?: string
    rules?: unknown
  }

  const m = (body.monthKey ?? "").match(/^(\d{4})-(\d{2})$/)
  if (!m) {
    return NextResponse.json({ error: "monthKey=YYYY-MM is required" }, { status: 400 })
  }
  if (!validateRules(body.rules)) {
    return NextResponse.json({ error: "Invalid rules payload" }, { status: 400 })
  }
  const year = Number(m[1])
  const month = Number(m[2])

  const client = await clientPromise
  const db = client.db(DELIVER_DB)

  // Static flows keep their specialized transforms
  if (body.flowKey === "trip") {
    const rows = await fetchDeliverRows(db, year, month)
    const { monthKey, uniqueLdt, trips, excluded } = buildMonthTrips(rows, year, month, body.rules)
    return NextResponse.json({
      success: true,
      data: {
        monthKey,
        rowsScanned: rows.length,
        uniqueLdt,
        trips: trips.length,
        excluded: excluded.total,
        excludedByRule: excluded.byRule,
      },
    })
  }
  if (body.flowKey === "transport-cost") {
    const rows = await fetchDeliverRows(db, year, month)
    const flow = STATIC_FLOWS["transport-cost"]
    const { monthKey, rowsInMonth, docs, totalAmount, byCategory, excluded } = buildMonthCosts(
      rows,
      year,
      month,
      body.rules,
      flow.defaultCategory ?? "ค่าขนส่ง"
    )
    return NextResponse.json({
      success: true,
      data: {
        monthKey,
        rowsScanned: rows.length,
        uniqueLdt: rowsInMonth,
        trips: docs.length,
        totalAmount,
        byCategory,
        excluded: excluded.total,
        excludedByRule: excluded.byRule,
      },
    })
  }
  if (body.flowKey === "weight") {
    const rows = await fetchDeliverRows(db, year, month)
    const { monthKey, uniqueLdt, docs, totalWeight, excluded } = buildMonthWeights(
      rows,
      year,
      month,
      body.rules
    )
    return NextResponse.json({
      success: true,
      data: {
        monthKey,
        rowsScanned: rows.length,
        uniqueLdt,
        trips: docs.length,
        totalWeight,
        excluded: excluded.total,
        excludedByRule: excluded.byRule,
      },
    })
  }

  // Resolve flow config: existing dynamic flow, or wizard draft
  let flow: FlowConfig | null = null
  if (body.flowKey) {
    flow = await getFlow(db, body.flowKey)
  } else if (body.draft) {
    const d = body.draft
    if (!d.sourceCollection || !SOURCES[d.sourceCollection]) {
      return NextResponse.json({ error: "Datasource ไม่อยู่ใน whitelist" }, { status: 400 })
    }
    if (!Array.isArray(d.columns) || d.columns.length === 0) {
      return NextResponse.json({ error: "ต้องเลือกคอลัมน์อย่างน้อย 1 คอลัมน์" }, { status: 400 })
    }
    flow = toFlowConfig({
      flowKey: "draft",
      name: "draft",
      description: "",
      sourceCollection: d.sourceCollection,
      monthField: d.monthField || null,
      dedupeField: d.dedupeField || null,
      columns: d.columns,
      targetCollection: "draft",
      createdBy: "draft",
      createdAt: new Date(),
    })
  }
  if (!flow || !flow.dynamic) {
    return NextResponse.json({ error: "Unknown flow" }, { status: 400 })
  }

  const rows = await fetchFlowRows(db, flow, year, month)
  const { monthKey, candidates, docs, excluded } = buildFlowMonthData(
    rows,
    flow,
    body.rules,
    year,
    month
  )

  return NextResponse.json({
    success: true,
    data: {
      monthKey,
      rowsScanned: rows.length,
      uniqueLdt: candidates,
      trips: docs.length,
      excluded: excluded.total,
      excludedByRule: excluded.byRule,
      sample: docs.slice(0, 5),
    },
  })
}
