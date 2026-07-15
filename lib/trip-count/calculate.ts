import { applyRules, type EtlRule, type RuleRecord } from "../etl/engine";

// One row from mena-bi.deliverResult, projected to the fields the ETL needs.
export interface DeliverRow {
  ldt: string | null;
  ldtBase: string | null;
  service: string | null;
  subcode: string | null;
  zone: string | null;
  branch: string | null;
  plateHead: string | null; // หัว — tractor registration
  plateTail: string | null; // หาง — trailer registration
  weightOrigin: number | string | null; // น้ำหนักต้นทาง
  weightDest: number | string | null; // น้ำหนักปลายทาง
  issueDate: string | Date | null; // ออก LDT — "DD/MM/YYYY" string or Date
}

// One surviving trip (unique _ldt_base) stored raw in mena-bi.tripData
export interface TripDoc {
  monthKey: string;
  year: number;
  month: number;
  issueDate: string | Date | null;
  ldt: string | null;
  ldtBase: string;
  service: string;
  subcode: string | null;
  zone: string | null;
  branch: string | null;
  plateHead: string | null;
  plateTail: string | null;
}

// One surviving trip with its resolved weight, stored raw in mena-bi.weightData
export interface WeightDoc extends TripDoc {
  weightOrigin: number; // น้ำหนักต้นทาง
  weightDest: number; // น้ำหนักปลายทาง
  weight: number; // น้ำหนัก = weightDest ยกเว้น weightDest = 1 ให้ใช้ weightOrigin
}

export interface MonthTripResult {
  monthKey: string;
  year: number;
  month: number;
  uniqueLdt: number;
  trips: TripDoc[];
  excluded: {
    total: number;
    byRule: Record<string, number>; // rule label → cut count
  };
}

export function monthKeyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseIssueMonth(
  issueDate: string | Date | null
): { year: number; month: number } | null {
  if (issueDate instanceof Date) {
    return { year: issueDate.getUTCFullYear(), month: issueDate.getUTCMonth() + 1 };
  }
  if (typeof issueDate === "string") {
    const m = issueDate.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return { year: Number(m[3]), month: Number(m[2]) };
  }
  return null;
}

// Rule fields the trip flow exposes (must match FLOWS.trip.ruleFields)
export function toRuleRecord(row: DeliverRow): RuleRecord {
  return {
    บริการ: row.service ?? "",
    โซน: row.zone ?? "",
    subcode: row.subcode ?? "",
    LDT: row.ldt ?? "",
    สาขา: row.branch ?? "",
  };
}

// Trip = unique _ldt_base whose ออก LDT falls in the target month-year and
// survives every cut rule. Returns the surviving rows as raw trip docs.
export function buildMonthTrips(
  rows: Iterable<DeliverRow>,
  year: number,
  month: number,
  rules: EtlRule[]
): MonthTripResult {
  const seen = new Map<string, DeliverRow>();
  for (const row of rows) {
    if (!row.ldtBase) continue;
    const issued = parseIssueMonth(row.issueDate);
    if (!issued || issued.year !== year || issued.month !== month) continue;
    if (!seen.has(row.ldtBase)) seen.set(row.ldtBase, row);
  }

  const monthKey = monthKeyOf(year, month);
  const trips: TripDoc[] = [];
  const excluded = { total: 0, byRule: {} as Record<string, number> };

  for (const row of seen.values()) {
    const cutBy = applyRules(toRuleRecord(row), rules);
    if (cutBy) {
      excluded.total += 1;
      excluded.byRule[cutBy.label] = (excluded.byRule[cutBy.label] ?? 0) + 1;
      continue;
    }
    trips.push({
      monthKey,
      year,
      month,
      issueDate: row.issueDate,
      ldt: row.ldt,
      ldtBase: row.ldtBase!,
      service: (row.service ?? "").trim() || "(ไม่ระบุบริการ)",
      subcode: row.subcode,
      zone: row.zone,
      branch: row.branch,
      plateHead: row.plateHead,
      plateTail: row.plateTail,
    });
  }

  return { monthKey, year, month, uniqueLdt: seen.size, trips, excluded };
}

export interface MonthWeightResult {
  monthKey: string;
  year: number;
  month: number;
  uniqueLdt: number;
  docs: WeightDoc[];
  totalWeight: number;
  excluded: {
    total: number;
    byRule: Record<string, number>;
  };
}

function toNumber(v: number | string | null): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Master น้ำหนัก: same unit as trips (unique _ldt_base per ออก LDT month, first
// row only) + resolved weight: น้ำหนักปลายทาง = 1 → ใช้น้ำหนักต้นทาง, otherwise
// use น้ำหนักปลายทาง (null/0 counts as 0).
export function buildMonthWeights(
  rows: DeliverRow[], // array required — iterated twice
  year: number,
  month: number,
  rules: EtlRule[]
): MonthWeightResult {
  const { monthKey, uniqueLdt, trips, excluded } = buildMonthTrips(rows, year, month, rules);
  // buildMonthTrips keeps the first row per _ldt_base; re-read its weights
  const byBase = new Map<string, DeliverRow>();
  for (const row of rows) {
    if (row.ldtBase && !byBase.has(row.ldtBase)) byBase.set(row.ldtBase, row);
  }

  let totalWeight = 0;
  const docs: WeightDoc[] = trips.map((t) => {
    const src = byBase.get(t.ldtBase);
    const weightOrigin = toNumber(src?.weightOrigin ?? null);
    const weightDest = toNumber(src?.weightDest ?? null);
    const weight = weightDest === 1 ? weightOrigin : weightDest;
    totalWeight += weight;
    return { ...t, weightOrigin, weightDest, weight };
  });

  return {
    monthKey,
    year,
    month,
    uniqueLdt,
    docs,
    totalWeight: Math.round(totalWeight * 100) / 100,
    excluded,
  };
}
