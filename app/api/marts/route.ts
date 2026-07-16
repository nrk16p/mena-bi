import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"
import { DELIVER_DB } from "@/lib/trip-count/source"
import { MARTS_COLLECTION, getAllMarts } from "@/lib/mart/registry"
import type { MartConfig } from "@/lib/mart/engine"

const MART_KEY_RE = /^[a-z0-9][a-z0-9-]{2,39}$/

// Measure sources the wizard can join onto a truck grain (plate + service).
// numeric = fields that can be summed; hasPlateTail = supports head+tail counting.
const MEASURE_SOURCES: Record<
  string,
  { label: string; numeric: string[]; hasPlateTail: boolean; hasCategory?: string }
> = {
  weightData: { label: "น้ำหนัก (weightData)", numeric: ["weight", "weightOrigin", "weightDest"], hasPlateTail: true },
  transportCost: { label: "ค่าขนส่ง (transportCost)", numeric: ["amount"], hasPlateTail: false, hasCategory: "category" },
  driverCostData: { label: "ค่าเที่ยว พจส (driverCostData)", numeric: ["fee", "fee1", "fee2"], hasPlateTail: false },
  fuelQtyData: { label: "จำนวนเชื้อเพลิง (fuelQtyData)", numeric: ["oil", "ngv"], hasPlateTail: false },
}

// Master attributes available as dimensions (mastertruck grain).
const MASTER_DIMS = ["ศูนย์", "Fleet", "Site", "Group Site", "Plant", "เชื้อเพลิง", "Type"]
const CONDITION_FIELDS = ["Type", "Fleet", "ศูนย์", "เชื้อเพลิง"]

async function getPerms() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  const perms = await getUserPermissions(email)
  return { email: email ?? null, ...perms }
}

// GET /api/marts            → list all marts
// GET /api/marts?catalog=1  → wizard catalog (sources, dims, condition fields)
export async function GET(req: NextRequest) {
  const perms = await getPerms()
  if (!perms.isAdmin && !perms.allowedGroups.includes("bi")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const client = await clientPromise
  const db = client.db(DELIVER_DB)

  if (new URL(req.url).searchParams.get("catalog") === "1") {
    // distinct values for the condition fields (from the latest mastertruck month)
    const latestYm = (await db.collection("mastertruck").distinct("YM")).sort((a, b) => b - a)[0]
    const conditions: Record<string, string[]> = {}
    for (const f of CONDITION_FIELDS) {
      conditions[f] = ((await db.collection("mastertruck").distinct(f, { YM: latestYm })) as string[])
        .filter(Boolean)
        .sort()
    }
    return NextResponse.json({
      success: true,
      data: { measureSources: MEASURE_SOURCES, masterDims: MASTER_DIMS, conditionFields: CONDITION_FIELDS, conditions, isAdmin: perms.isAdmin },
    })
  }

  const marts = await getAllMarts(db)
  return NextResponse.json({
    success: true,
    data: marts.map((m) => ({ martKey: m.martKey, name: m.name, description: m.description, static: m.martKey === "truck-summary" })),
  })
}

// POST /api/marts — create a truck-grain mart (admin only)
export async function POST(req: NextRequest) {
  const perms = await getPerms()
  if (!perms.isAdmin) return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })

  const body = (await req.json()) as {
    martKey?: string
    name?: string
    description?: string
    dimAttrs?: string[]
    measures?: Array<{ source: string; fields: string[]; useTail?: boolean; groupByCategory?: boolean }>
    condition?: { field: string; values: string[] } | null
  }

  const martKey = (body.martKey ?? "").trim()
  if (!MART_KEY_RE.test(martKey)) {
    return NextResponse.json({ error: "martKey ต้องเป็น a-z, 0-9, - ยาว 3-40" }, { status: 400 })
  }
  if (!body.name?.trim()) return NextResponse.json({ error: "ต้องระบุชื่อ" }, { status: 400 })
  if (!Array.isArray(body.measures) || body.measures.length === 0) {
    return NextResponse.json({ error: "ต้องเลือก data อย่างน้อย 1 แหล่ง" }, { status: 400 })
  }

  // Validate + translate the wizard payload into a MartConfig
  const measures = []
  for (const m of body.measures) {
    const src = MEASURE_SOURCES[m.source]
    if (!src) return NextResponse.json({ error: `ไม่รู้จัก source: ${m.source}` }, { status: 400 })
    const fields = (m.fields ?? []).filter((f) => src.numeric.includes(f))
    if (!fields.length) continue
    measures.push({
      source: m.source,
      plateKeys: m.useTail && src.hasPlateTail ? ["plateHead", "plateTail"] : ["plateHead"],
      serviceField: "service",
      fields: fields.map((f) => ({ field: f, as: f })),
      ...(m.groupByCategory && src.hasCategory
        ? { groupByField: src.hasCategory, groupByAs: `${m.source}_byCategory` }
        : {}),
    })
  }
  if (!measures.length) return NextResponse.json({ error: "ไม่มี field ที่เลือก" }, { status: 400 })

  const dimAttrs = (body.dimAttrs ?? []).filter((d) => MASTER_DIMS.includes(d))

  const config: MartConfig = {
    martKey,
    name: body.name.trim(),
    description: (body.description ?? "").trim(),
    grainMaster: "mastertruck",
    monthField: "YM",
    grainKeys: ["ทะเบียนรถ", "บริการ"],
    plateField: "ทะเบียนรถ",
    serviceKey: "บริการ",
    dimAttrs,
    fleetAttrs: ["Fleet", "Site", "Group Site"].filter((a) => dimAttrs.includes(a) || a === "Fleet"),
    fuelTypeSource: measures.some((m) => m.source === "fuelQtyData")
      ? { source: "fuelQtyData", plateField: "plateHead", typeField: "fuelType" }
      : undefined,
    measures,
    baseFilter: body.condition && body.condition.values.length
      ? { field: body.condition.field, values: body.condition.values }
      : undefined,
  }

  const client = await clientPromise
  const db = client.db(DELIVER_DB)
  if (martKey === "truck-summary" || (await db.collection(MARTS_COLLECTION).findOne({ martKey }))) {
    return NextResponse.json({ error: `martKey "${martKey}" ถูกใช้แล้ว` }, { status: 409 })
  }
  await db.collection(MARTS_COLLECTION).insertOne({
    ...config,
    createdBy: perms.email,
    createdAt: new Date(),
  })

  return NextResponse.json({ success: true, data: { martKey } })
}
