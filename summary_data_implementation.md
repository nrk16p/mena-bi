# Summary Data Implementation

## ภาพรวม

สร้าง datasnapshot collection `summaryData` ใน `mena-bi` โดย join ข้อมูลจาก 3 collections เข้าด้วยกัน รายรถต่อเดือน

---

## MongoDB Schema — `summaryData`

```ts
{
  monthKey: string,       // "2026-05"  — index
  YM: number,             // 202605     — จาก mastertruck
  ทะเบียนรถ: string,      // index (ร่วมกับ monthKey)
  ศูนย์: string | null,
  บริการ: string | null,
  Fleet: string | null,
  Site: string | null,
  เชื้อเพลิง: string | null,
  Type: string | null,

  // จาก weightData — match plateHead OR plateTail
  weight: {
    trips: number,              // จำนวนเที่ยว
    totalWeight: number,        // น้ำหนักรวม
    totalWeightOrigin: number,  // น้ำหนักต้นทางรวม
    totalWeightDest: number,    // น้ำหนักปลายทางรวม
  } | null,

  // จาก transportCost — match plateHead เท่านั้น
  cost: {
    rows: number,               // จำนวนรายการ
    total: number,              // ค่าขนส่งรวม (บาท)
    byCategory: {               // แยกตามประเภทรายได้
      [category: string]: { rows: number; amount: number }
    }
  } | null,

  snapshotAt: Date,             // เวลาที่สร้าง snapshot
}
```

### Indexes

| Index | หมายเหตุ |
|-------|----------|
| `{ monthKey: 1 }` | filter รายเดือน |
| `{ monthKey: 1, ทะเบียนรถ: 1 }` | lookup รายรถ/เดือน |

---

## Match Rules

| Source | Field | → Target | Field |
|--------|-------|----------|-------|
| mastertruck | `YM` (Int32: 202605) | weightData / transportCost | `monthKey` (String: "2026-05") |
| mastertruck | `ทะเบียนรถ` | weightData | `plateHead` **หรือ** `plateTail` |
| mastertruck | `ทะเบียนรถ` | transportCost | `plateHead` เท่านั้น |

> หมายเหตุ: น้ำหนัก — ทะเบียน match ได้ทั้ง plateHead (หัว) และ plateTail (หาง)
> ค่าขนส่ง — match เฉพาะ plateHead (ค่าจัดส่งคิดที่รถหัวลาก)

---

## ไฟล์ที่สร้าง/แก้ไข

| ไฟล์ | ประเภท | หน้าที่ |
|------|--------|---------|
| `lib/summary/snapshot.ts` | Core Logic | `buildMonthSnapshot(db, ym)` — query + join + aggregate |
| `app/api/summary-etl/route.ts` | API POST | trigger ETL snapshot, รับ `{ from, to }` หรือ `{ months }` |
| `app/api/summary-data/route.ts` | API GET | query summaryData พร้อม filter + pagination |
| `app/datapipeline/data/summary/page.tsx` | Frontend | หน้าแสดงผล Summary Data |
| `app/datapipeline/data/page.tsx` | Updated | เพิ่ม card "Summary Data" ใน Data Hub |

---

## API Endpoints

### `POST /api/summary-etl`

สร้าง snapshot รายเดือน (แทนที่ข้อมูลเดิมทั้งเดือน)

```json
// Request body
{ "from": "2026-05", "to": "2026-05" }
// หรือ
{ "months": 3 }

// Response
{
  "success": true,
  "data": [
    {
      "monthKey": "2026-05",
      "trucks": 150,
      "inserted": 150,
      "weightMatched": 142,
      "costMatched": 138,
      "durationMs": 1234
    }
  ]
}
```

### `GET /api/summary-data`

```
/api/summary-data?monthKey=2026-05&page=1&pageSize=50
  &fleet=A&center=สระบุรี&service=บริการ&q=ทะเบียน&all=1
```

---

## หน้า Frontend

**URL:** `/datapipeline/data/summary`

**Features:**
- Filter: เดือน, ศูนย์, บริการ, Fleet, ค้นหาทะเบียน
- ปุ่ม "คำนวณใหม่ (ETL)" — สร้าง snapshot เดือนที่เลือก
- ปุ่ม "Export Excel" — ดาวน์โหลดทุก column รวม cost breakdown
- Summary bar: เที่ยว, น้ำหนัก, ค่าขนส่งแยกประเภท, รวม (คำนวณจากหน้าปัจจุบัน)
- Table columns: ทะเบียนรถ, ศูนย์, บริการ, Fleet, Site, เชื้อเพลิง, Type, เที่ยว, น้ำหนัก, ค่าขนส่ง, ค่าโอนย้าย, ประกันรายได้+อื่นๆ, รวม

---

## ETL Logic

```
สำหรับแต่ละเดือน (YM):
1. Query mastertruck WHERE YM = ym                      → รายการรถ
2. Query weightData WHERE monthKey = "YYYY-MM"          → ข้อมูลน้ำหนัก
3. Query transportCost WHERE monthKey = "YYYY-MM"       → ข้อมูลค่าขนส่ง

4. สร้าง weightByPlate Map (plateHead + plateTail → aggregate)
5. สร้าง costByPlate Map (plateHead → aggregate)

6. สำหรับแต่ละรถใน mastertruck:
   - lookup weight จาก weightByPlate[ทะเบียนรถ]
   - lookup cost จาก costByPlate[ทะเบียนรถ]
   - สร้าง SummaryDoc

7. deleteMany({ monthKey }) แล้ว insertMany ใหม่ (idempotent)
```

---

## วิธีใช้งาน

1. เปิดหน้า **Data → Summary Data** ใน Sidebar
2. เลือกเดือนที่ต้องการ
3. กดปุ่ม **"คำนวณใหม่ (ETL)"** เพื่อสร้าง snapshot
4. รอ ~5-30 วิ (ขึ้นกับปริมาณข้อมูล)
5. ดูผลลัพธ์ในตาราง / Export Excel
