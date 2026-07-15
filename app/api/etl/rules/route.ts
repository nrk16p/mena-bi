import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { getFlow } from "@/lib/etl/flows"
import { getRuleDoc, saveRuleDoc } from "@/lib/etl/rules-store"
import { validateRules } from "@/lib/etl/engine"

async function getPerms() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  const perms = await getUserPermissions(email)
  return { email: email ?? null, ...perms }
}

// GET /api/etl/rules?flowKey=trip — current rule set (seeds on first read)
export async function GET(req: NextRequest) {
  const perms = await getPerms()
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const flowKey = new URL(req.url).searchParams.get("flowKey") ?? "trip"
  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const flow = await getFlow(db, flowKey)
  if (!flow) {
    return NextResponse.json({ error: "Unknown flow" }, { status: 400 })
  }

  const doc = await getRuleDoc(db, flowKey)
  return NextResponse.json({
    success: true,
    data: { ...doc, _id: undefined, ruleFields: flow.ruleFields, isAdmin: perms.isAdmin },
  })
}

// PUT /api/etl/rules — save new rule set (admin only, version bump + history)
export async function PUT(req: NextRequest) {
  const perms = await getPerms()
  if (!perms.isAdmin) {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })
  }

  const body = (await req.json()) as { flowKey?: string; rules?: unknown }
  const flowKey = body.flowKey ?? ""
  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  const flow = await getFlow(db, flowKey)
  if (!flow) {
    return NextResponse.json({ error: "Unknown flow" }, { status: 400 })
  }
  if (!validateRules(body.rules)) {
    return NextResponse.json({ error: "Invalid rules payload" }, { status: 400 })
  }
  const allowedFields = new Set(flow.ruleFields)
  if (body.rules.some((r) => !allowedFields.has(r.field))) {
    return NextResponse.json({ error: "Rule field not allowed for this flow" }, { status: 400 })
  }

  const doc = await saveRuleDoc(db, flowKey, body.rules, perms.email ?? "unknown")
  return NextResponse.json({ success: true, data: { ...doc, _id: undefined } })
}
