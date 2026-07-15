// Flow registry — one entry per datasource → condition&process → data pillar chain.
// Static flows (trip) live in code because they have custom transform logic.
// User-created flows live in mena-bi.etl_flows and run through the generic executor.

import type { Db } from "mongodb"

export const RULES_COLLECTION = "etl_rules"
export const RULES_HISTORY_COLLECTION = "etl_rules_history"
export const RUNS_COLLECTION = "etl_runs"
export const FLOWS_COLLECTION = "etl_flows"

// Datasources users may build flows on (pillar 1 whitelist)
export const SOURCES: Record<string, { pipeline: string; label: string }> = {
  deliverResult: { pipeline: "deliver_result", label: "รายงานผลการจัดส่ง (deliverResult)" },
  driverCost: { pipeline: "driver_cost", label: "ค่าเที่ยว พขร. (driverCost)" },
}

export interface FlowConfig {
  flowKey: string
  name: string
  description: string
  sourceCollection: string
  sourcePipeline: string // `pipeline` value in mena-bi.pipeline_runs
  targetCollection: string
  ruleFields: string[] // fields the Conditions UI can build rules on
  sourceHref: string
  conditionsHref: string
  targetHref: string
  dynamic: boolean
  /** What one row in the target collection means, e.g. "เที่ยว" */
  unit: string
  /** Headline number for the Data pillar: a numeric field logged on each etl_runs entry */
  metric: { runField: string; label: string; unit: string } | null
  // generic-executor config (dynamic flows only)
  monthField: string | null // date field (DD/MM/YYYY) for month attribution; null = file month
  dedupeField: string | null // unique-key field; null = keep every row
  columns: string[] // columns stored in the target collection
}

export interface DynamicFlowDoc {
  flowKey: string
  name: string
  description: string
  sourceCollection: string
  monthField: string | null
  dedupeField: string | null
  columns: string[]
  targetCollection: string
  createdBy: string
  createdAt: Date
}

export const STATIC_FLOWS: Record<string, FlowConfig> = {
  trip: {
    flowKey: "trip",
    name: "Trip",
    description: "รายงานผลการจัดส่ง → ตัดเที่ยวตามเงื่อนไข → เที่ยววิ่ง (unique LDT)",
    sourceCollection: "deliverResult",
    sourcePipeline: "deliver_result",
    targetCollection: "tripData",
    ruleFields: ["บริการ", "โซน", "subcode", "LDT", "สาขา"],
    sourceHref: "/datapipeline/datasource",
    conditionsHref: "/datapipeline/conditions?flow=trip",
    targetHref: "/datawarehouse/trip",
    dynamic: false,
    unit: "เที่ยว",
    metric: null,
    monthField: "ออก LDT",
    dedupeField: "_ldt_base",
    columns: [],
  },
  weight: {
    flowKey: "weight",
    name: "Master น้ำหนัก",
    description: "รายงานผลการจัดส่ง → ตัดเที่ยวตามเงื่อนไข → น้ำหนักต่อเที่ยว (ปลายทาง = 1 ใช้ต้นทาง)",
    sourceCollection: "deliverResult",
    sourcePipeline: "deliver_result",
    targetCollection: "weightData",
    ruleFields: ["บริการ", "โซน", "subcode", "LDT", "สาขา"],
    sourceHref: "/datapipeline/datasource",
    conditionsHref: "/datapipeline/conditions?flow=weight",
    targetHref: "/datawarehouse/weight",
    dynamic: false,
    unit: "เที่ยว",
    metric: { runField: "totalWeight", label: "น้ำหนักรวม", unit: "" },
    monthField: "ออก LDT",
    dedupeField: "_ldt_base",
    columns: [],
  },
}

export function toFlowConfig(d: DynamicFlowDoc): FlowConfig {
  return {
    flowKey: d.flowKey,
    name: d.name,
    description: d.description,
    sourceCollection: d.sourceCollection,
    sourcePipeline: SOURCES[d.sourceCollection]?.pipeline ?? "",
    targetCollection: d.targetCollection,
    ruleFields: d.columns,
    sourceHref: d.sourceCollection === "deliverResult" ? "/datapipeline/datasource" : "/datapipeline/flows",
    conditionsHref: `/datapipeline/conditions?flow=${d.flowKey}`,
    targetHref: `/datawarehouse/data?flow=${d.flowKey}`,
    dynamic: true,
    unit: "แถว",
    metric: null,
    monthField: d.monthField,
    dedupeField: d.dedupeField,
    columns: d.columns,
  }
}

export async function getAllFlows(db: Db): Promise<FlowConfig[]> {
  const dynamic = await db
    .collection<DynamicFlowDoc>(FLOWS_COLLECTION)
    .find({})
    .sort({ createdAt: 1 })
    .toArray()
  return [...Object.values(STATIC_FLOWS), ...dynamic.map(toFlowConfig)]
}

export async function getFlow(db: Db, flowKey: string): Promise<FlowConfig | null> {
  if (STATIC_FLOWS[flowKey]) return STATIC_FLOWS[flowKey]
  const doc = await db.collection<DynamicFlowDoc>(FLOWS_COLLECTION).findOne({ flowKey })
  return doc ? toFlowConfig(doc) : null
}
