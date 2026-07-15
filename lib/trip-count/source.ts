import type { Db } from "mongodb";
import type { DeliverRow } from "./calculate";

export const DELIVER_DB = "mena-bi";
export const DELIVER_COLLECTION = "deliverResult";
export const TRIP_DATA_COLLECTION = "tripData";
export const WEIGHT_DATA_COLLECTION = "weightData";
export const COST_DATA_COLLECTION = "transportCost";

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
