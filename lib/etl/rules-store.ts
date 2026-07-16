import type { Db } from "mongodb"
import type { EtlRule, EtlRuleDoc } from "./engine"
import { getFlow, RULES_COLLECTION, RULES_HISTORY_COLLECTION } from "./flows"
import legacyRules from "../trip-count/rules.json"

// Seed for the trip flow, converted from the original rules.json blacklist.
// Order matters: first matching rule attributes the cut.
export function buildTripSeedRules(): EtlRule[] {
  return [
    {
      id: "service-excluded",
      label: "ตัดบริการ (ชดเชยเชื้อเพลิง)",
      field: "บริการ",
      operator: "equals",
      values: legacyRules.excludedServices,
      enabled: true,
    },
    {
      id: "zone-excluded",
      label: "ตัดโซน (Guarantee / Fix Cost)",
      field: "โซน",
      operator: "equals",
      values: legacyRules.excludedZones,
      enabled: true,
    },
    {
      id: "subcode-excluded",
      label: "ตัด subcode (ค่าเที่ยว / หักค่าเที่ยว)",
      field: "subcode",
      operator: "equals",
      values: legacyRules.excludedSubcodes,
      enabled: true,
    },
    {
      id: "subcode-keyword",
      label: "ตัด subcode ที่มีคำ",
      field: "subcode",
      operator: "contains",
      values: legacyRules.subcodeKeywords,
      enabled: true,
    },
    {
      id: "ldt-keyword",
      label: "ตัด LDT ที่มีคำ",
      field: "LDT",
      operator: "contains_word",
      values: legacyRules.ldtKeywords,
      enabled: true,
    },
  ]
}

// Master ค่าขนส่ง: cut rules first, then classification. Order = precedence,
// so anything not matched falls through to the flow's defaultCategory (ค่าขนส่ง).
export function buildCostSeedRules(): EtlRule[] {
  return [
    {
      id: "service-excluded",
      label: "ตัดบริการ (ชดเชยเชื้อเพลิง)",
      field: "บริการ",
      operator: "equals",
      values: [
        "Mixer ชดเชยเชื้อเพลิง โม่เล็ก",
        "Mixer ชดเชยเชื้อเพลิง โม่ใหญ่",
        "ชดเชยเชื้อเพลิงตู้เย็น 9.5 10 ล้อ สระบุรี",
        "ชดเชยเชื้อเพลิงตู้เย็น 9.5 12 ล้อ สระบุรี",
        "ชดเชยเชื้อเพลิงงานตู้ผ้าใบ TDM",
      ],
      enabled: true,
      action: "exclude",
    },
    {
      id: "subcode-excluded",
      label: "ตัด subcode (ค่าเที่ยว / ค่าลงของ / ฯลฯ)",
      field: "subcode",
      operator: "equals",
      values: [
        "ค่าเที่ยว",
        "หักค่าเที่ยว",
        "ค่าเทช้า",
        "ค่าทางด่วน",
        "ค่าธรรมเนียม",
        "ค่าบริการ",
        "ค่าลงของ",
      ],
      enabled: true,
      action: "exclude",
    },
    {
      id: "subcode-keyword",
      label: "ตัด subcode ที่มีคำ",
      field: "subcode",
      operator: "contains",
      values: ["ค่าชั่งน้ำหนัก"],
      enabled: true,
      action: "exclude",
    },
    {
      id: "ldt-keyword",
      label: "ตัด LDT ที่มีคำ",
      field: "LDT",
      operator: "contains_word",
      values: ["Gen"],
      enabled: true,
      action: "exclude",
    },
    {
      id: "cat-guarantee",
      label: "โซน Guarantee / Fix Cost → ประกันรายได้",
      field: "โซน",
      operator: "equals",
      values: ["Guarantee", "Fix Cost Old", "Fix Cost New"],
      enabled: true,
      action: "classify",
      category: "ประกันรายได้ + ค่าอื่นๆ",
    },
    {
      id: "cat-transfer",
      label: "บริการ Mixer ค่าโอนย้าย → ค่าโอนย้าย",
      field: "บริการ",
      operator: "equals",
      values: ["Mixer ค่าโอนย้าย"],
      enabled: true,
      action: "classify",
      category: "ค่าโอนย้าย",
    },
  ]
}

// Master ค่าเที่ยว พจส: ค่าเที่ยว is computed (พจส 1 + พจส 2) before the rules
// run, so the "no fee at all" cut is a single editable rule.
export function buildDriverCostSeedRules(): EtlRule[] {
  return [
    {
      id: "no-fee",
      label: "ตัดแถวที่ไม่มีค่าเที่ยว (พจส 1 + พจส 2 = 0)",
      field: "ค่าเที่ยว",
      operator: "equals",
      values: ["0"],
      enabled: true,
      action: "exclude",
    },
  ]
}

// Master จำนวนเชื้อเพลิง: จำนวนเชื้อเพลิง (Oil + NGV) is computed before the
// rules run, so the "no fuel at all" cut is a single editable rule.
export function buildFuelQtySeedRules(): EtlRule[] {
  return [
    {
      id: "no-fuel",
      label: "ตัดแถวที่ไม่มีเชื้อเพลิง (Oil + NGV = 0)",
      field: "จำนวนเชื้อเพลิง",
      operator: "equals",
      values: ["0"],
      enabled: true,
      action: "exclude",
    },
  ]
}

const SEEDS: Record<string, () => EtlRule[]> = {
  trip: buildTripSeedRules,
  weight: buildTripSeedRules, // same cut conditions as trip, editable independently
  "transport-cost": buildCostSeedRules,
  "driver-cost": buildDriverCostSeedRules,
  "fuel-qty": buildFuelQtySeedRules,
}

// Load the rule doc for a flow, seeding version 1 on first use.
// Static flows seed from code; dynamic flows fall back to an empty rule set
// (their real v1 is created by createRuleDoc at flow-creation time).
export async function getRuleDoc(db: Db, flowKey: string): Promise<EtlRuleDoc> {
  const col = db.collection<EtlRuleDoc>(RULES_COLLECTION)
  const existing = await col.findOne({ flowKey })
  if (existing) return existing

  const flow = await getFlow(db, flowKey)
  if (!flow) throw new Error(`Unknown flow: ${flowKey}`)

  const seeded: EtlRuleDoc = {
    flowKey,
    name: flow.name,
    version: 1,
    rules: SEEDS[flowKey]?.() ?? [],
    updatedAt: new Date(),
    updatedBy: "seed",
  }
  await col.insertOne(seeded)
  return seeded
}

// First rule set for a newly created dynamic flow (version 1, no history).
export async function createRuleDoc(
  db: Db,
  flowKey: string,
  name: string,
  rules: EtlRule[],
  updatedBy: string
): Promise<EtlRuleDoc> {
  const doc: EtlRuleDoc = {
    flowKey,
    name,
    version: 1,
    rules,
    updatedAt: new Date(),
    updatedBy,
  }
  await db.collection<EtlRuleDoc>(RULES_COLLECTION).insertOne(doc)
  return doc
}

// Save a new rule set: bump version, archive the previous doc.
export async function saveRuleDoc(
  db: Db,
  flowKey: string,
  rules: EtlRule[],
  updatedBy: string
): Promise<EtlRuleDoc> {
  const col = db.collection<EtlRuleDoc>(RULES_COLLECTION)
  const prev = await getRuleDoc(db, flowKey)

  const { _id, ...prevSnapshot } = prev as EtlRuleDoc & { _id?: unknown }
  void _id
  await db.collection(RULES_HISTORY_COLLECTION).insertOne({
    ...prevSnapshot,
    archivedAt: new Date(),
  })

  const next: EtlRuleDoc = {
    flowKey,
    name: prev.name,
    version: prev.version + 1,
    rules,
    updatedAt: new Date(),
    updatedBy,
  }
  await col.replaceOne({ flowKey }, next, { upsert: true })
  return next
}
