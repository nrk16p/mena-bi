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

const SEEDS: Record<string, () => EtlRule[]> = {
  trip: buildTripSeedRules,
  weight: buildTripSeedRules, // same cut conditions as trip, editable independently
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
