import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { runModelQuery, type ModelQuery } from "@/lib/model/query"
import { getSemanticModel } from "@/lib/model/semantic"

// GET  /api/model/query?modelKey=truck-summary  → catalog (measures + dimensions)
// POST /api/model/query  { measures, dimensions, filters, monthKey } → aggregated result
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const modelKey = new URL(req.url).searchParams.get("modelKey") ?? "truck-summary"
  const model = getSemanticModel(modelKey)
  if (!model) return NextResponse.json({ error: "unknown model" }, { status: 404 })
  return NextResponse.json({
    success: true,
    data: {
      modelKey,
      measures: model.measures.map((m) => ({ key: m.key, label: m.label, group: m.group, format: m.format })),
      dimensions: model.dimensions,
    },
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const perms = await getUserPermissions(session?.user?.email)
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  let body: ModelQuery
  try {
    body = (await req.json()) as ModelQuery
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }
  if (!Array.isArray(body.measures) || body.measures.length === 0) {
    return NextResponse.json({ error: "measures[] is required" }, { status: 400 })
  }
  try {
    const client = await clientPromise
    const result = await runModelQuery(client.db(DELIVER_DB), body)
    return NextResponse.json({ success: true, data: result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "query failed" }, { status: 400 })
  }
}
