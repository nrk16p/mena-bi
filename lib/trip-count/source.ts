import type { Db } from "mongodb";
import type { DeliverRow } from "./calculate";

export const DELIVER_DB = "mena-bi";
export const DELIVER_COLLECTION = "deliverResult";
export const TRIP_DATA_COLLECTION = "tripData";
export const WEIGHT_DATA_COLLECTION = "weightData";
export const COST_DATA_COLLECTION = "transportCost";
export const DRIVER_COST_COLLECTION = "driverCost";
export const DRIVER_COST_DATA_COLLECTION = "driverCostData";
export const FUEL_QTY_DATA_COLLECTION = "fuelQtyData";

// Fetch slim rows for a target month via the (_year,_month,_branch) index.
// Includes ±1 neighbouring file-months because ออก LDT can fall outside the
// month of the report file the row came from.
export async function fetchDeliverRows(
  db: Db,
  year: number,
  month: number
): Promise<DeliverRow[]> {
  const fileMonths = [-1, 0, 1].map((delta) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    return { _year: d.getUTCFullYear(), _month: d.getUTCMonth() + 1 };
  });

  const cursor = db.collection(DELIVER_COLLECTION).find(
    { $or: fileMonths },
    {
      projection: {
        _id: 0,
        "ออก LDT": 1,
        บริการ: 1,
        subcode: 1,
        โซน: 1,
        หัว: 1,
        หาง: 1,
        น้ำหนักต้นทาง: 1,
        น้ำหนักปลายทาง: 1,
        ค่าจัดส่ง: 1,
        LDT: 1,
        _ldt_base: 1,
        _branch: 1,
      },
    }
  );

  const rows: DeliverRow[] = [];
  for await (const d of cursor) {
    rows.push({
      ldt: d["LDT"] != null ? String(d["LDT"]) : null,
      ldtBase: d["_ldt_base"] != null ? String(d["_ldt_base"]) : null,
      service: d["บริการ"] != null ? String(d["บริการ"]) : null,
      subcode: d["subcode"] != null ? String(d["subcode"]) : null,
      zone: d["โซน"] != null ? String(d["โซน"]) : null,
      branch: d["_branch"] != null ? String(d["_branch"]) : null,
      plateHead: d["หัว"] != null ? String(d["หัว"]) : null,
      plateTail: d["หาง"] != null ? String(d["หาง"]) : null,
      weightOrigin: (d["น้ำหนักต้นทาง"] as number | string) ?? null,
      weightDest: (d["น้ำหนักปลายทาง"] as number | string) ?? null,
      amount: (d["ค่าจัดส่ง"] as number | string) ?? null,
      issueDate: (d["ออก LDT"] as string | Date) ?? null,
    });
  }
  return rows;
}

// ── driverCost ──────────────────────────────────────────────────────────────

export interface DriverCostRow {
  ldt: string | null;
  ldtBase: string | null;
  service: string | null;
  subcode: string | null;
  zone: string | null;
  branch: string | null;
  partnerType: string | null; // ประเภทรถร่วม
  plateHead: string | null; // หัว
  driver1: string | null; // พจส1
  driver2: string | null; // พจส2
  fee1: number | string | null; // ค่าเที่ยว พจส 1
  fee2: number | string | null; // ค่าเที่ยว พจส 2
  oil1: number | string | null; // Rate น้ำมัน พจส 1
  oil2: number | string | null; // Rate น้ำมัน พจส 2
  ngv1: number | string | null; // Rate NGV พจส 1
  ngv2: number | string | null; // Rate NGV พจส 2
  issueDate: string | Date | null; // ออก LDT
}

// Same ±1 file-month window as deliverResult: ออก LDT can fall outside the
// month of the report file the row came from.
export async function fetchDriverCostRows(
  db: Db,
  year: number,
  month: number
): Promise<DriverCostRow[]> {
  const fileMonths = [-1, 0, 1].map((delta) => {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1));
    return { _year: d.getUTCFullYear(), _month: d.getUTCMonth() + 1 };
  });

  const cursor = db.collection(DRIVER_COST_COLLECTION).find(
    { $or: fileMonths },
    {
      projection: {
        _id: 0,
        "ออก LDT": 1,
        บริการ: 1,
        subcode: 1,
        โซน: 1,
        ประเภทรถร่วม: 1,
        หัว: 1,
        พจส1: 1,
        พจส2: 1,
        "ค่าเที่ยว พจส 1": 1,
        "ค่าเที่ยว พจส 2": 1,
        "Rate น้ำมัน พจส 1": 1,
        "Rate น้ำมัน พจส 2": 1,
        "Rate NGV พจส 1": 1,
        "Rate NGV พจส 2": 1,
        LDT: 1,
        _ldt_base: 1,
        _branch: 1,
      },
    }
  );

  const rows: DriverCostRow[] = [];
  for await (const d of cursor) {
    rows.push({
      ldt: d["LDT"] != null ? String(d["LDT"]) : null,
      ldtBase: d["_ldt_base"] != null ? String(d["_ldt_base"]) : null,
      service: d["บริการ"] != null ? String(d["บริการ"]) : null,
      subcode: d["subcode"] != null ? String(d["subcode"]) : null,
      zone: d["โซน"] != null ? String(d["โซน"]) : null,
      branch: d["_branch"] != null ? String(d["_branch"]) : null,
      partnerType: d["ประเภทรถร่วม"] != null ? String(d["ประเภทรถร่วม"]) : null,
      plateHead: d["หัว"] != null ? String(d["หัว"]) : null,
      driver1: d["พจส1"] != null ? String(d["พจส1"]) : null,
      driver2: d["พจส2"] != null ? String(d["พจส2"]) : null,
      fee1: (d["ค่าเที่ยว พจส 1"] as number | string) ?? null,
      fee2: (d["ค่าเที่ยว พจส 2"] as number | string) ?? null,
      oil1: (d["Rate น้ำมัน พจส 1"] as number | string) ?? null,
      oil2: (d["Rate น้ำมัน พจส 2"] as number | string) ?? null,
      ngv1: (d["Rate NGV พจส 1"] as number | string) ?? null,
      ngv2: (d["Rate NGV พจส 2"] as number | string) ?? null,
      issueDate: (d["ออก LDT"] as string | Date) ?? null,
    });
  }
  return rows;
}
