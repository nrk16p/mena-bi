import type { Db, Document } from "mongodb"

// ── Snowflake-schema mart engine ─────────────────────────────────────────────
// A mart joins several derived collections + master data onto a grain defined by
// a master collection. Conformed dimensions (dim_truck → dim_fleet, dim_service,
// dim_month) are emitted normalized; the fact carries dimension keys plus a few
// denormalized attributes for query convenience.

export const MART_DATA_COLLECTION = "martData"
export const DIM_TRUCK = "dim_truck"
export const DIM_FLEET = "dim_fleet"
export const DIM_SERVICE = "dim_service"
export const DIM_MONTH = "dim_month"

/** How one source collection contributes measures to the grain. */
export interface MeasureSpec {
  source: string // derived collection, e.g. "weightData"
  // A source row joins to a grain cell when one of its plate fields equals the
  // grain plate AND its service equals the grain บริการ. Listing two plate keys
  // (head+tail) makes one row count for both trucks — intentional for weight.
  plateKeys: string[] // ["plateHead"] or ["plateHead","plateTail"]
  serviceField: string // "service"
  // Numeric fields on the source summed into measures, keyed by output name.
  fields: Array<{ field: string; as: string }>
  // Optional per-category breakdown (e.g. transportCost by category).
  groupByField?: string
  groupByAs?: string
  countAs?: string // if set, also emit a row-count measure under this name
}

export interface MartConfig {
  martKey: string
  name: string
  description: string
  grainMaster: string // "mastertruck"
  monthField: string // "YM"
  grainKeys: string[] // ["ทะเบียนรถ", "บริการ"] — composite grain (month is implicit)
  plateField: string // which grain key is the truck plate — "ทะเบียนรถ"
  serviceKey: string // which grain key is the service — "บริการ"
  dimAttrs: string[] // master fields denormalized onto the fact for filtering
  fleetAttrs: string[] // subset that snowflakes into dim_fleet
  measures: MeasureSpec[]
  // Optional fuel-type dimension sourced from a plate→type map.
  fuelTypeSource?: { source: string; plateField: string; typeField: string }
}

export interface MartResult {
  monthKey: string
  ym: number
  facts: Document[]
  dims: { truck: Document[]; fleet: Document[]; service: Document[]; month: Document }
  matchRates: Record<string, { sourceRows: number; matchedRows: number; rate: number; grainHit: number }>
  grainRows: number
}

export function ymToMonthKey(ym: number): string {
  return `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, "0")}`
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const round = (n: number) => Math.round(n * 100) / 100
const SEP = "||"
const str = (v: unknown): string => (v == null ? "" : String(v))
const fleetKey = (attrs: string[], row: Document) => attrs.map((a) => str(row[a])).join(SEP)

interface FactAcc {
  base: Document
  measures: Record<string, number>
  byCategory: Record<string, Record<string, number>> // measureAs → category → sum
  matched: Record<string, boolean> // source → hit
}

export async function buildMonthMart(db: Db, mart: MartConfig, ym: number): Promise<MartResult> {
  const monthKey = ymToMonthKey(ym)

  // ── Grain: master rows for the month (NOT deduped — a plate can run several
  //    services, so plate × service are distinct grain cells). ──
  const baseRows = await db
    .collection(mart.grainMaster)
    .find({ [mart.monthField]: ym }, { projection: { _id: 0 } })
    .toArray()

  const grain = new Map<string, FactAcc>()
  for (const row of baseRows) {
    const key = mart.grainKeys.map((k) => str(row[k])).join(SEP)
    if (!grain.has(key)) grain.set(key, { base: row, measures: {}, byCategory: {}, matched: {} })
  }

  // ── Fuel-type map (plate → Oil/NGV); no row ever has both. ──
  const fuelByPlate = new Map<string, string>()
  if (mart.fuelTypeSource) {
    const fs = mart.fuelTypeSource
    const rows = await db
      .collection(fs.source)
      .find({ monthKey }, { projection: { _id: 0, [fs.plateField]: 1, [fs.typeField]: 1 } })
      .toArray()
    for (const r of rows) {
      const p = str(r[fs.plateField])
      const t = str(r[fs.typeField])
      if (p && t && t !== "(ไม่ระบุ)" && !fuelByPlate.has(p)) fuelByPlate.set(p, t)
    }
  }

  // ── Measures: fan each source row out to matching grain cells. ──
  const matchRates: MartResult["matchRates"] = {}
  for (const m of mart.measures) {
    const proj: Document = { _id: 0, [m.serviceField]: 1 }
    for (const pk of m.plateKeys) proj[pk] = 1
    for (const f of m.fields) proj[f.field] = 1
    if (m.groupByField) proj[m.groupByField] = 1
    const rows = await db.collection(m.source).find({ monthKey }, { projection: proj }).toArray()

    let matchedRows = 0
    const hitGrain = new Set<string>()
    for (const r of rows) {
      const service = str(r[m.serviceField])
      const plates = new Set<string>()
      for (const pk of m.plateKeys) {
        const p = str(r[pk])
        if (p) plates.add(p)
      }
      let hit = false
      for (const plate of plates) {
        const key = plate + SEP + service // grain = ทะเบียน × บริการ
        const cell = grain.get(key)
        if (!cell) continue
        hit = true
        hitGrain.add(key)
        cell.matched[m.source] = true
        for (const f of m.fields) cell.measures[f.as] = (cell.measures[f.as] ?? 0) + num(r[f.field])
        if (m.countAs) cell.measures[m.countAs] = (cell.measures[m.countAs] ?? 0) + 1
        if (m.groupByField && m.groupByAs) {
          const cat = str(r[m.groupByField]) || "(ไม่ระบุ)"
          const bucket = (cell.byCategory[m.groupByAs] ??= {})
          // groupBy sums the FIRST field only (e.g. cost amount by category)
          bucket[cat] = (bucket[cat] ?? 0) + num(r[m.fields[0].field])
        }
      }
      if (hit) matchedRows++
    }
    matchRates[m.source] = {
      sourceRows: rows.length,
      matchedRows,
      rate: rows.length ? round((matchedRows / rows.length) * 100) : 0,
      grainHit: hitGrain.size,
    }
  }

  // ── Conformed dimensions ──
  const fleetMap = new Map<string, Document>()
  const truckMap = new Map<string, Document>()
  const serviceSet = new Set<string>()
  for (const row of baseRows) {
    const plate = str(row[mart.plateField])
    const service = str(row[mart.serviceKey])
    if (service) serviceSet.add(service)
    const fKey = fleetKey(mart.fleetAttrs, row)
    if (!fleetMap.has(fKey)) {
      const f: Document = { fleetKey: fKey, YM: ym, monthKey }
      for (const a of mart.fleetAttrs) f[a] = row[a] ?? null
      fleetMap.set(fKey, f)
    }
    const tKey = plate
    if (plate && !truckMap.has(tKey)) {
      truckMap.set(tKey, {
        ทะเบียนรถ: plate,
        YM: ym,
        monthKey,
        fleetKey: fKey,
        fuelType: fuelByPlate.get(plate) ?? null,
      })
    }
  }

  // ── Facts ──
  const snapshotAt = new Date()
  const facts: Document[] = []
  for (const [, cell] of grain) {
    const plate = str(cell.base[mart.plateField])
    const fact: Document = {
      martKey: mart.martKey,
      monthKey,
      YM: ym,
      ทะเบียนรถ: plate,
      บริการ: str(cell.base[mart.serviceKey]),
      fuelType: fuelByPlate.get(plate) ?? null,
      snapshotAt,
    }
    for (const a of mart.dimAttrs) fact[a] = cell.base[a] ?? null
    for (const m of mart.measures) {
      for (const f of m.fields) fact[f.as] = round(cell.measures[f.as] ?? 0)
      if (m.countAs) fact[m.countAs] = cell.measures[m.countAs] ?? 0
      if (m.groupByAs) {
        const b = cell.byCategory[m.groupByAs] ?? {}
        fact[m.groupByAs] = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, round(v)]))
      }
    }
    fact._matched = cell.matched
    facts.push(fact)
  }

  return {
    monthKey,
    ym,
    facts,
    dims: {
      truck: [...truckMap.values()],
      fleet: [...fleetMap.values()],
      service: [...serviceSet].sort().map((s) => ({ บริการ: s })),
      month: {
        YM: ym,
        monthKey,
        year: Math.floor(ym / 100),
        month: ym % 100,
        quarter: Math.floor(((ym % 100) - 1) / 3) + 1,
      },
    },
    matchRates,
    grainRows: grain.size,
  }
}
