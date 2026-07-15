import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import {
  FLOWS_COLLECTION,
  SOURCES,
  STATIC_FLOWS,
  getAllFlows,
  type DynamicFlowDoc,
} from "@/lib/etl/flows"
import { validateRules } from "@/lib/etl/engine"
import { createRuleDoc } from "@/lib/etl/rules-store"

const FLOW_KEY_RE = /^[a-z0-9][a-z0-9-]{2,39}$/

// GET /api/etl/flows — list all flows (static + dynamic)
export async function GET() {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const client = await clientPromise
  const flows = await getAllFlows(client.db(DELIVER_DB))
  return NextResponse.json({ success: true, data: flows })
}

// POST /api/etl/flows — create a dynamic flow (admin only) + its rules v1
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  const perms = await getUserPermissions(email)
  if (!perms.isAdmin) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })
  }

  const body = (await req.json()) as {
    flowKey?: string
    name?: string
    description?: string
    sourceCollection?: string
    monthField?: string | null
    dedupeField?: string | null
    columns?: string[]
    rules?: unknown
  }

  const flowKey = (body.flowKey ?? "").trim()
  const name = (body.name ?? "").trim()
  if (!FLOW_KEY_RE.test(flowKey)) {
    return NextResponse.json(
      { error: "flowKey ต้องเป็น a-z, 0-9, - ยาว 3-40 ตัวอักษร" },
      { status: 400 }
    )
  }
  if (!name) {
    return NextResponse.json({ error: "ต้องระบุชื่อ flow" }, { status: 400 })
  }
  if (!body.sourceCollection || !SOURCES[body.sourceCollection]) {
    return NextResponse.json({ error: "Datasource ไม่อยู่ใน whitelist" }, { status: 400 })
  }
  if (!Array.isArray(body.columns) || body.columns.length === 0) {
    return NextResponse.json({ error: "ต้องเลือกคอลัมน์อย่างน้อย 1 คอลัมน์" }, { status: 400 })
  }
  const rules = body.rules ?? []
  if (!validateRules(rules)) {
    return NextResponse.json({ error: "Invalid rules payload" }, { status: 400 })
  }
  const allowedFields = new Set(body.columns)
  if (rules.some((r) => !allowedFields.has(r.field))) {
    return NextResponse.json(
      { error: "เงื่อนไขอ้างถึง field ที่ไม่ได้เลือกเก็บ" },
      { status: 400 }
    )
  }

  const client = await clientPromise
  const db = client.db(DELIVER_DB)

  if (STATIC_FLOWS[flowKey] || (await db.collection(FLOWS_COLLECTION).findOne({ flowKey }))) {
    return NextResponse.json({ error: `flowKey "${flowKey}" ถูกใช้แล้ว` }, { status: 409 })
  }

  // Target collection is derived, prefixed, and never user-typed
  const targetCollection = `dw_${flowKey.replace(/-/g, "_")}`

  const doc: DynamicFlowDoc = {
    flowKey,
    name,
    description: (body.description ?? "").trim(),
    sourceCollection: body.sourceCollection,
    monthField: body.monthField || null,
    dedupeField: body.dedupeField || null,
    columns: body.columns,
    targetCollection,
    createdBy: email ?? "unknown",
    createdAt: new Date(),
  }
  await db.collection(FLOWS_COLLECTION).insertOne(doc)
  await createRuleDoc(db, flowKey, name, rules, email ?? "unknown")

  return NextResponse.json({ success: true, data: { flowKey, targetCollection } })
}
