"use client"

import { useCallback, useEffect, useState } from "react"
import * as XLSX from "xlsx"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { BackLink } from "@/components/back-link"

type SummaryRow = {
  monthKey: string
  ทะเบียนรถ: string
  ศูนย์: string | null
  บริการ: string | null
  Fleet: string | null
  Site: string | null
  เชื้อเพลิง: string | null
  Type: string | null
  weight: {
    trips: number
    totalWeight: number
    totalWeightOrigin: number
    totalWeightDest: number
  } | null
  cost: {
    rows: number
    total: number
    byCategory: Record<string, { rows: number; amount: number }>
  } | null
  snapshotAt?: string
}

type ApiData = {
  rows: SummaryRow[]
  total: number
  page: number
  pageSize: number
  fleets: string[]
  centers: string[]
  services: string[]
  snapshotAt: string | null
}

const KNOWN_CATEGORIES = ["ค่าขนส่ง", "ค่าโอนย้าย", "ประกันรายได้ + ค่าอื่นๆ"]

const PAGE_SIZE = 50

function monthOptions(count = 24): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
}

const baht = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

function toExportRows(rows: SummaryRow[]) {
  return rows.map((r) => ({
    ทะเบียนรถ: r.ทะเบียนรถ,
    ศูนย์: r.ศูนย์ ?? "",
    บริการ: r.บริการ ?? "",
    Fleet: r.Fleet ?? "",
    Site: r.Site ?? "",
    เชื้อเพลิง: r.เชื้อเพลิง ?? "",
    Type: r.Type ?? "",
    เที่ยว: r.weight?.trips ?? 0,
    น้ำหนัก: r.weight?.totalWeight ?? 0,
    น้ำหนักต้นทาง: r.weight?.totalWeightOrigin ?? 0,
    น้ำหนักปลายทาง: r.weight?.totalWeightDest ?? 0,
    "ค่าขนส่ง (บาท)": r.cost?.byCategory?.["ค่าขนส่ง"]?.amount ?? 0,
    "ค่าโอนย้าย (บาท)": r.cost?.byCategory?.["ค่าโอนย้าย"]?.amount ?? 0,
    "ประกันรายได้+ค่าอื่นๆ (บาท)": r.cost?.byCategory?.["ประกันรายได้ + ค่าอื่นๆ"]?.amount ?? 0,
    "รวมค่าใช้จ่าย (บาท)": r.cost?.total ?? 0,
  }))
}

export default function SummaryDataPage() {
  const [monthKey, setMonthKey] = useState(monthOptions()[1])
  const [fleet, setFleet] = useState("")
  const [center, setCenter] = useState("")
  const [service, setService] = useState("")
  const [q, setQ] = useState("")
  const [qDraft, setQDraft] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasFilter = !!(fleet || center || service || q)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ monthKey, page: String(page), pageSize: String(PAGE_SIZE) })
      if (fleet) params.set("fleet", fleet)
      if (center) params.set("center", center)
      if (service) params.set("service", service)
      if (q) params.set("q", q)
      const res = await fetch(`/api/summary-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [monthKey, fleet, center, service, q, page])

  useEffect(() => {
    load()
  }, [load])

  async function runEtl() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch("/api/summary-etl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: monthKey, to: monthKey }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "คำนวณไม่สำเร็จ")
      setPage(1)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "คำนวณไม่สำเร็จ")
    } finally {
      setRunning(false)
    }
  }

  async function exportExcel() {
    setExporting(true)
    setError(null)
    try {
      const params = new URLSearchParams({ monthKey, all: "1" })
      if (fleet) params.set("fleet", fleet)
      if (center) params.set("center", center)
      if (service) params.set("service", service)
      if (q) params.set("q", q)
      const res = await fetch(`/api/summary-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "export ไม่สำเร็จ")
      const exportRows = toExportRows(json.data.rows as SummaryRow[])
      const ws = XLSX.utils.json_to_sheet(exportRows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "summaryData")
      XLSX.writeFile(wb, `summaryData-${monthKey}${hasFilter ? "-filtered" : ""}.xlsx`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "export ไม่สำเร็จ")
    } finally {
      setExporting(false)
    }
  }

  const totalPages = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1
  const isEmpty = data !== null && data.total === 0 && !hasFilter

  return (
    <div className="max-w-full">
      <BackLink href="/datapipeline/data" label="กลับไปหน้า Data" />

      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/50">
          <LayoutGrid size={18} className="text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Summary Data</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            สรุปข้อมูลรายรถต่อเดือน — Master รถ × น้ำหนัก × ค่าขนส่ง
          </p>
        </div>
      </div>

      {/* Category cost summary */}
      {data && data.total > 0 && (() => {
        const totals: Record<string, number> = {}
        let grandTotal = 0
        let totalTrips = 0
        let totalWeight = 0
        for (const row of data.rows) {
          totalTrips += row.weight?.trips ?? 0
          totalWeight += row.weight?.totalWeight ?? 0
          grandTotal += row.cost?.total ?? 0
          for (const cat of KNOWN_CATEGORIES) {
            totals[cat] = (totals[cat] ?? 0) + (row.cost?.byCategory?.[cat]?.amount ?? 0)
          }
        }
        return (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 px-4 py-3">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">เที่ยว (หน้านี้)</span>
              <p className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-white">{totalTrips.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">น้ำหนัก (หน้านี้)</span>
              <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{totalWeight.toLocaleString()}</p>
            </div>
            {KNOWN_CATEGORIES.map((cat) => (
              <div key={cat} className="rounded-xl border border-sky-100 dark:border-sky-900/40 bg-sky-50/50 dark:bg-sky-950/20 px-4 py-3">
                <span className="inline-block rounded-md bg-sky-100 dark:bg-sky-900/50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                  {cat}
                </span>
                <p className="mt-1 text-xl font-bold tabular-nums text-sky-800 dark:text-sky-200">{baht(totals[cat] ?? 0)}</p>
              </div>
            ))}
            <div className="rounded-xl border border-gray-900/10 dark:border-white/12 bg-gray-900 dark:bg-white/8 px-4 py-3">
              <span className="text-[11px] font-semibold text-gray-300 dark:text-gray-400">รวมค่าขนส่ง (หน้านี้)</span>
              <p className="mt-1 text-xl font-bold tabular-nums text-white">{baht(grandTotal)}</p>
            </div>
          </div>
        )
      })()}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={monthKey}
          onChange={(e) => {
            setMonthKey(e.target.value)
            setFleet(""); setCenter(""); setService(""); setQ(""); setQDraft("")
            setPage(1)
          }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-violet-400"
        >
          {monthOptions().map((mk) => (
            <option key={mk} value={mk}>{mk}</option>
          ))}
        </select>

        <select
          value={center}
          onChange={(e) => { setCenter(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-violet-400"
        >
          <option value="">ทุกศูนย์</option>
          {(data?.centers ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={service}
          onChange={(e) => { setService(e.target.value); setPage(1) }}
          className="h-9 max-w-[240px] rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-violet-400"
        >
          <option value="">ทุกบริการ</option>
          {(data?.services ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={fleet}
          onChange={(e) => { setFleet(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-violet-400"
        >
          <option value="">ทุก Fleet</option>
          {(data?.fleets ?? []).map((f) => <option key={f} value={f}>{f}</option>)}
        </select>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQ(qDraft.trim()); setPage(1) } }}
            placeholder="ค้นหา ทะเบียน / Fleet / ศูนย์..."
            className="h-9 w-52 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
              pl-8 pr-7 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-violet-400"
          />
          {q && (
            <button
              onClick={() => { setQ(""); setQDraft(""); setPage(1) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <button
          onClick={runEtl}
          disabled={running || loading}
          className="flex h-9 items-center gap-2 rounded-lg border border-violet-200 dark:border-violet-800/50
            bg-violet-50 dark:bg-violet-950/30 px-3 text-[13px] font-medium
            text-violet-700 dark:text-violet-300 disabled:opacity-50
            hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {running ? "กำลังสร้าง Snapshot..." : "คำนวณใหม่ (ETL)"}
        </button>

        <button
          onClick={exportExcel}
          disabled={exporting || loading || !data || data.total === 0}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3
            text-[13px] font-medium text-gray-600 dark:text-gray-300 disabled:opacity-40
            hover:bg-gray-50 dark:hover:bg-white/6 transition-colors"
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export Excel
        </button>

        <div className="ml-auto flex items-center gap-3 text-[12px] text-gray-400 dark:text-gray-500">
          {data && data.total > 0 && (
            <span>{data.total.toLocaleString()} รายการ</span>
          )}
          {data?.snapshotAt && (
            <span>Snapshot ล่าสุด {new Date(data.snapshotAt).toLocaleString("th-TH")}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30
          px-3 py-2 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-white/12 p-10 text-center">
          <p className="text-[13px] text-gray-500 dark:text-gray-400">ยังไม่มีข้อมูลเดือน {monthKey}</p>
          <p className="mt-1 text-[12px] text-gray-400 dark:text-gray-500">
            กด &quot;คำนวณใหม่ (ETL)&quot; เพื่อสร้าง Snapshot จาก Master รถ × น้ำหนัก × ค่าขนส่ง
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 p-10 text-[13px] text-gray-400">
              <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
            </div>
          ) : (
            <div className="max-h-[calc(100vh-330px)] overflow-auto">
              <table className="w-full text-[12px] whitespace-nowrap">
                <thead>
                  <tr>
                    {/* Truck info */}
                    {["ทะเบียนรถ", "ศูนย์", "บริการ", "Fleet", "Site", "เชื้อเพลิง", "Type"].map((col) => (
                      <th
                        key={col}
                        className="sticky top-0 z-10 border-b border-gray-200 dark:border-white/8
                          bg-gray-50 dark:bg-[#181c26] px-3 py-2.5 text-left font-semibold
                          text-gray-500 dark:text-gray-400"
                      >
                        {col}
                      </th>
                    ))}
                    {/* Weight */}
                    <th className="sticky top-0 z-10 border-b border-gray-200 dark:border-white/8
                      bg-gray-50 dark:bg-[#181c26] px-3 py-2.5 text-right font-semibold
                      text-emerald-600 dark:text-emerald-400">
                      เที่ยว
                    </th>
                    <th className="sticky top-0 z-10 border-b border-gray-200 dark:border-white/8
                      bg-gray-50 dark:bg-[#181c26] px-3 py-2.5 text-right font-semibold
                      text-emerald-600 dark:text-emerald-400">
                      น้ำหนัก
                    </th>
                    {/* Cost categories */}
                    {KNOWN_CATEGORIES.map((cat) => (
                      <th
                        key={cat}
                        className="sticky top-0 z-10 border-b border-gray-200 dark:border-white/8
                          bg-gray-50 dark:bg-[#181c26] px-3 py-2.5 text-right font-semibold
                          text-sky-600 dark:text-sky-400 max-w-[120px]"
                      >
                        {cat}
                      </th>
                    ))}
                    <th className="sticky top-0 z-10 border-b border-gray-200 dark:border-white/8
                      bg-gray-50 dark:bg-[#181c26] px-3 py-2.5 text-right font-semibold
                      text-violet-700 dark:text-violet-300">
                      รวม
                    </th>
                  </tr>
                </thead>
                <tbody className={loading ? "opacity-50" : ""}>
                  {(data?.rows ?? []).map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100 dark:border-white/5 last:border-0
                        hover:bg-gray-50 dark:hover:bg-white/4 transition-colors"
                    >
                      <td className="px-3 py-2 font-mono text-gray-700 dark:text-gray-200">
                        {row.ทะเบียนรถ || "-"}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.ศูนย์ ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.บริการ ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.Fleet ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.Site ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.เชื้อเพลิง ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.Type ?? "-"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                        {row.weight ? row.weight.trips.toLocaleString() : "-"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                        {row.weight ? row.weight.totalWeight.toLocaleString() : "-"}
                      </td>
                      {KNOWN_CATEGORIES.map((cat) => (
                        <td key={cat} className="px-3 py-2 text-right tabular-nums text-sky-700 dark:text-sky-300">
                          {row.cost?.byCategory?.[cat]
                            ? baht(row.cost.byCategory[cat].amount)
                            : "-"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-violet-700 dark:text-violet-300">
                        {row.cost ? baht(row.cost.total) : "-"}
                      </td>
                    </tr>
                  ))}
                  {data && data.rows.length === 0 && (
                    <tr>
                      <td colSpan={7 + 2 + KNOWN_CATEGORIES.length + 1} className="p-8 text-center text-gray-400">
                        ไม่มีข้อมูล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {data && data.total > 0 && (
            <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/8 px-3 py-2">
              <span className="text-[12px] text-gray-400 dark:text-gray-500">
                หน้า {data.page} / {totalPages.toLocaleString()} · {data.total.toLocaleString()} รายการ
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page <= 1 || loading}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10
                    text-gray-500 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/6"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page >= totalPages || loading}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10
                    text-gray-500 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/6"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
