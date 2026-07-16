import { applyRules, resolveRow, type EtlRule, type RuleRecord } from "../etl/engine";

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
  amount: number | string | null; // ค่าจัดส่ง
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

interface MonthResolution {
  monthKey: string;
  uniqueLdt: number;
  /** _ldt_base → the row that represents the trip (first row that survives the rules) */
  kept: Map<string, DeliverRow>;
  excluded: { total: number; byRule: Record<string, number> };
}

// One LDT can appear on several rows (e.g. a real delivery plus a
// ชดเชยเชื้อเพลิง entry). Cut the LDT only when EVERY row of that month is cut;
// otherwise the first surviving row represents the trip. This keeps the count
// independent of the order Mongo returns rows in.
function resolveMonth(
  rows: Iterable<DeliverRow>,
  year: number,
  month: number,
  rules: EtlRule[]
): MonthResolution {
  const byBase = new Map<string, DeliverRow[]>();
  for (const row of rows) {
    if (!row.ldtBase) continue;
    const issued = parseIssueMonth(row.issueDate);
    if (!issued || issued.year !== year || issued.month !== month) continue;
    const list = byBase.get(row.ldtBase);
    if (list) list.push(row);
    else byBase.set(row.ldtBase, [row]);
  }

  const kept = new Map<string, DeliverRow>();
  const excluded = { total: 0, byRule: {} as Record<string, number> };

  for (const [base, list] of byBase) {
    let representative: DeliverRow | null = null;
    let firstCutLabel: string | null = null;
    for (const row of list) {
      const cutBy = applyRules(toRuleRecord(row), rules);
      if (!cutBy) {
        representative = row;
        break;
      }
      firstCutLabel ??= cutBy.label;
    }
    if (representative) {
      kept.set(base, representative);
    } else {
      excluded.total += 1;
      const label = firstCutLabel ?? "(ไม่ระบุเงื่อนไข)";
      excluded.byRule[label] = (excluded.byRule[label] ?? 0) + 1;
    }
  }

  return { monthKey: monthKeyOf(year, month), uniqueLdt: byBase.size, kept, excluded };
}

// Trip = unique _ldt_base whose ออก LDT falls in the target month-year and has
// at least one row surviving every cut rule.
export function buildMonthTrips(
  rows: Iterable<DeliverRow>,
  year: number,
  month: number,
  rules: EtlRule[]
): MonthTripResult {
  const { monthKey, uniqueLdt, kept, excluded } = resolveMonth(rows, year, month, rules);

  const trips: TripDoc[] = [];
  for (const [base, row] of kept) {
    trips.push({
      monthKey,
      year,
      month,
      issueDate: row.issueDate,
      ldt: row.ldt,
      ldtBase: base,
      service: (row.service ?? "").trim() || "(ไม่ระบุบริการ)",
      subcode: row.subcode,
      zone: row.zone,
      branch: row.branch,
      plateHead: row.plateHead,
      plateTail: row.plateTail,
    });
  }

  return { monthKey, year, month, uniqueLdt, trips, excluded };
}

// One charge row stored raw in mena-bi.transportCost
export interface CostDoc {
  monthKey: string;
  year: number;
  month: number;
  issueDate: string | Date | null;
  ldt: string | null;
  service: string;
  subcode: string | null;
  zone: string | null;
  branch: string | null;
  plateHead: string | null;
  amount: number; // ค่าจัดส่ง
  category: string; // ประเภทรายได้
}

export interface MonthCostResult {
  monthKey: string;
  year: number;
  month: number;
  rowsInMonth: number;
  docs: CostDoc[];
  totalAmount: number;
  byCategory: Record<string, { rows: number; amount: number }>;
  excluded: {
    total: number;
    amount: number;
    byRule: Record<string, number>;
  };
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

// Master น้ำหนัก: same unit as trips (unique _ldt_base per ออก LDT month) +
// resolved weight taken from the same representative row the trip uses:
// น้ำหนักปลายทาง = 1 → ใช้น้ำหนักต้นทาง, otherwise use น้ำหนักปลายทาง
// (null/0 counts as 0).
export function buildMonthWeights(
  rows: DeliverRow[],
  year: number,
  month: number,
  rules: EtlRule[]
): MonthWeightResult {
  const { monthKey, uniqueLdt, kept, excluded } = resolveMonth(rows, year, month, rules);

  let totalWeight = 0;
  const docs: WeightDoc[] = [];
  for (const [base, row] of kept) {
    const weightOrigin = toNumber(row.weightOrigin);
    const weightDest = toNumber(row.weightDest);
    const weight = weightDest === 1 ? weightOrigin : weightDest;
    totalWeight += weight;
    docs.push({
      monthKey,
      year,
      month,
      issueDate: row.issueDate,
      ldt: row.ldt,
      ldtBase: base,
      service: (row.service ?? "").trim() || "(ไม่ระบุบริการ)",
      subcode: row.subcode,
      zone: row.zone,
      branch: row.branch,
      plateHead: row.plateHead,
      plateTail: row.plateTail,
      weightOrigin,
      weightDest,
      weight,
    });
  }

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

// Master ค่าขนส่ง: money is counted PER ROW (no dedupe — every row is its own
// charge). Rules run in order: a cut rule drops the row, a classify rule files
// it under its category, anything else falls to defaultCategory.
export function buildMonthCosts(
  rows: Iterable<DeliverRow>,
  year: number,
  month: number,
  rules: EtlRule[],
  defaultCategory: string
): MonthCostResult {
  const monthKey = monthKeyOf(year, month);
  const docs: CostDoc[] = [];
  const byCategory: Record<string, { rows: number; amount: number }> = {};
  const excluded = { total: 0, amount: 0, byRule: {} as Record<string, number> };
  let rowsInMonth = 0;
  let totalAmount = 0;

  for (const row of rows) {
    const issued = parseIssueMonth(row.issueDate);
    if (!issued || issued.year !== year || issued.month !== month) continue;
    rowsInMonth += 1;

    const amount = toNumber(row.amount);
    const { cutBy, category } = resolveRow(toRuleRecord(row), rules, defaultCategory);
    if (cutBy) {
      excluded.total += 1;
      excluded.amount += amount;
      excluded.byRule[cutBy.label] = (excluded.byRule[cutBy.label] ?? 0) + 1;
      continue;
    }

    const cat = category ?? defaultCategory;
    totalAmount += amount;
    const bucket = (byCategory[cat] ??= { rows: 0, amount: 0 });
    bucket.rows += 1;
    bucket.amount += amount;

    docs.push({
      monthKey,
      year,
      month,
      issueDate: row.issueDate,
      ldt: row.ldt,
      service: (row.service ?? "").trim() || "(ไม่ระบุบริการ)",
      subcode: row.subcode,
      zone: row.zone,
      branch: row.branch,
      plateHead: row.plateHead,
      amount,
      category: cat,
    });
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  for (const b of Object.values(byCategory)) b.amount = round(b.amount);

  return {
    monthKey,
    year,
    month,
    rowsInMonth,
    docs,
    totalAmount: round(totalAmount),
    byCategory,
    excluded: { ...excluded, amount: round(excluded.amount) },
  };
}

// ── Master ค่าเที่ยว พจส (driverCost) ─────────────────────────────────────────

import type { DriverCostRow } from "./source";

// One driver-fee row stored raw in mena-bi.driverCostData
export interface DriverCostDoc {
  monthKey: string;
  year: number;
  month: number;
  issueDate: string | Date | null;
  ldt: string | null;
  service: string;
  subcode: string | null;
  zone: string | null;
  branch: string | null;
  partnerType: string | null;
  driver1: string | null;
  driver2: string | null;
  fee1: number;
  fee2: number;
  fee: number; // ค่าเที่ยว = พจส 1 + พจส 2
}

export interface MonthDriverCostResult {
  monthKey: string;
  year: number;
  month: number;
  rowsInMonth: number;
  docs: DriverCostDoc[];
  totalFee: number;
  byPartnerType: Record<string, { rows: number; fee: number }>;
  excluded: {
    total: number;
    byRule: Record<string, number>;
  };
}

// ค่าเที่ยว is computed BEFORE the rules run, so a rule can test it — that is
// how "ค่าเที่ยว พจส 1 + พจส 2 = 0 → ตัด" stays editable from the UI.
export function toDriverCostRuleRecord(row: DriverCostRow, fee: number): RuleRecord {
  return {
    บริการ: row.service ?? "",
    โซน: row.zone ?? "",
    subcode: row.subcode ?? "",
    LDT: row.ldt ?? "",
    สาขา: row.branch ?? "",
    ประเภทรถร่วม: row.partnerType ?? "",
    ค่าเที่ยว: String(fee),
  };
}

// Money is counted PER ROW (no LDT dedupe) — each row is its own driver fee.
export function buildMonthDriverCosts(
  rows: Iterable<DriverCostRow>,
  year: number,
  month: number,
  rules: EtlRule[]
): MonthDriverCostResult {
  const monthKey = monthKeyOf(year, month);
  const docs: DriverCostDoc[] = [];
  const byPartnerType: Record<string, { rows: number; fee: number }> = {};
  const excluded = { total: 0, byRule: {} as Record<string, number> };
  let rowsInMonth = 0;
  let totalFee = 0;

  for (const row of rows) {
    const issued = parseIssueMonth(row.issueDate);
    if (!issued || issued.year !== year || issued.month !== month) continue;
    rowsInMonth += 1;

    const fee1 = toNumber(row.fee1);
    const fee2 = toNumber(row.fee2);
    const fee = Math.round((fee1 + fee2) * 100) / 100;

    const cutBy = applyRules(toDriverCostRuleRecord(row, fee), rules);
    if (cutBy) {
      excluded.total += 1;
      excluded.byRule[cutBy.label] = (excluded.byRule[cutBy.label] ?? 0) + 1;
      continue;
    }

    const partnerType = (row.partnerType ?? "").trim() || "(ไม่ระบุ)";
    totalFee += fee;
    const bucket = (byPartnerType[partnerType] ??= { rows: 0, fee: 0 });
    bucket.rows += 1;
    bucket.fee += fee;

    docs.push({
      monthKey,
      year,
      month,
      issueDate: row.issueDate,
      ldt: row.ldt,
      service: (row.service ?? "").trim() || "(ไม่ระบุบริการ)",
      subcode: row.subcode,
      zone: row.zone,
      branch: row.branch,
      partnerType: row.partnerType,
      driver1: row.driver1,
      driver2: row.driver2,
      fee1,
      fee2,
      fee,
    });
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  for (const b of Object.values(byPartnerType)) b.fee = round(b.fee);

  return {
    monthKey,
    year,
    month,
    rowsInMonth,
    docs,
    totalFee: round(totalFee),
    byPartnerType,
    excluded,
  };
}
