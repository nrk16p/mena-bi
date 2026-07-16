"use client"

import { useCallback, useEffect, useState } from "react"
import * as XLSX from "xlsx"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Droplets,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { BackLink } from "@/components/back-link"

type FuelRow = {
  monthKey: string
  issueDate: string | null
  ldt: string | null
  service: string
  subcode: string | null
  zone: string | null
  branch: string | null
  partnerType: string | null
  plateHead: string | null
  oil1: number
  oil2: number
  oil: number
  ngv1: number
  ngv2: number
  ngv: number
  fuelType: string
  computedAt?: string
}

type ApiData = {
  rows: FuelRow[]
  total: number
  page: number
  pageSize: number
  fuelTypes: string[]
  services: string[]
  branches: string[]
  partnerTypes: string[]
  totalOil: number | null
  totalNgv: number | null
  byFuelType: Record<string, { rows: number; qty: number }> | null
  computedAt: string | null
  rulesVersion: number | null
}

const COLUMNS: Array<{ key: keyof FuelRow; label: string; numeric?: boolean; strong?: boolean }> = [
  { key: "issueDate", label: "ออก LDT" },
  { key: "ldt", label: "LDT" },
  { key: "service", label: "บริการ" },
  { key: "branch", label: "สาขา" },
  { key: "partnerType", label: "ประเภทรถร่วม" },
  { key: "plateHead", label: "หัว" },
  { key: "fuelType", label: "ประเภทเชื้อเพลิง" },
  { key: "oil1", label: "Rate น้ำมัน พจส 1", numeric: true },
  { key: "oil2", label: "Rate น้ำมัน พจส 2", numeric: true },
  { key: "oil", label: "Oil", numeric: true, strong: true },
  { key: "ngv1", label: "Rate NGV พจส 1", numeric: true },
  { key: "ngv2", label: "Rate NGV พจส 2", numeric: true },
  { key: "ngv", label: "NGV", numeric: true, strong: true },
]

const FUEL_TONE: Record<string, string> = {
  Oil: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40",
  NGV: "text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40",
}

const PAGE_SIZE = 50

function monthOptions(count = 24): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
}

const qty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

export default function FuelQtyPage() {
  const [monthKey, setMonthKey] = useState(monthOptions()[1])
  const [fuelType, setFuelType] = useState("")
  const [service, setService] = useState("")
  const [branch, setBranch] = useState("")
  const [partnerType, setPartnerType] = useState("")
  const [q, setQ] = useState("")
  const [qDraft, setQDraft] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasFilter = !!(fuelType || service || branch || partnerType || q)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ monthKey, page: String(page), pageSize: String(PAGE_SIZE) })
      if (fuelType) params.set("fuelType", fuelType)
      if (service) params.set("service", service)
      if (branch) params.set("branch", branch)
      if (partnerType) params.set("partnerType", partnerType)
      if (q) params.set("q", q)
      const res = await fetch(`/api/fuel-qty-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [monthKey, fuelType, service, branch, partnerType, q, page])

  useEffect(() => {
    load()
  }, [load])

  async function runEtl() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch("/api/fuel-qty-etl", {
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
      if (fuelType) params.set("fuelType", fuelType)
      if (service) params.set("service", service)
      if (branch) params.set("branch", branch)
      if (partnerType) params.set("partnerType", partnerType)
      if (q) params.set("q", q)
      const res = await fetch(`/api/fuel-qty-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "export ไม่สำเร็จ")
      const rows = (json.data.rows as FuelRow[]).map((r) =>
        Object.fromEntries(COLUMNS.map((c) => [c.label, r[c.key] ?? ""]))
      )
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "fuelQty")
      XLSX.writeFile(wb, `fuelQty-${monthKey}${hasFilter ? "-filtered" : ""}.xlsx`)
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
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/50">
          <Droplets size={18} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Master จำนวนเชื้อเพลิง</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            Oil = Rate น้ำมัน พจส 1+2 · NGV = Rate NGV พจส 1+2 — รายแถว (ไม่ dedupe) ตัดแถวที่ไม่มีเชื้อเพลิง
          </p>
        </div>
      </div>

      {/* Fuel summary — Oil and NGV are different units, kept apart */}
      {data && (data.totalOil != null || data.totalNgv != null) && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            onClick={() => { setFuelType(fuelType === "Oil" ? "" : "Oil"); setPage(1) }}
            className={`rounded-xl border px-4 py-3 text-left transition-colors
              ${fuelType === "Oil"
                ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/30"
                : "border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 hover:border-amber-300"}`}
          >
            <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${FUEL_TONE.Oil}`}>Oil</span>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-gray-900 dark:text-white">
              {qty(data.totalOil ?? 0)}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              {(data.byFuelType?.Oil?.rows ?? 0).toLocaleString()} แถว
            </p>
          </button>

          <button
            onClick={() => { setFuelType(fuelType === "NGV" ? "" : "NGV"); setPage(1) }}
            className={`rounded-xl border px-4 py-3 text-left transition-colors
              ${fuelType === "NGV"
                ? "border-teal-400 bg-teal-50/60 dark:bg-teal-950/30"
                : "border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 hover:border-teal-300"}`}
          >
            <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${FUEL_TONE.NGV}`}>NGV</span>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-gray-900 dark:text-white">
              {qty(data.totalNgv ?? 0)}
            </p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              {(data.byFuelType?.NGV?.rows ?? 0).toLocaleString()} แถว
            </p>
          </button>

          <div className="rounded-xl border border-gray-900/10 dark:border-white/12 bg-gray-900 dark:bg-white/8 px-4 py-3">
            <span className="text-[11px] font-semibold text-gray-300 dark:text-gray-400">แถวทั้งหมด</span>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-white">{data.total.toLocaleString()}</p>
            <p className="text-[11px] text-gray-400">ตาม filter ปัจจุบัน</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={monthKey}
          onChange={(e) => {
            setMonthKey(e.target.value)
            setFuelType(""); setService(""); setBranch(""); setPartnerType(""); setQ(""); setQDraft("")
            setPage(1)
          }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-amber-400"
        >
          {monthOptions().map((mk) => <option key={mk} value={mk}>{mk}</option>)}
        </select>

        <select
          value={service}
          onChange={(e) => { setService(e.target.value); setPage(1) }}
          className="h-9 max-w-[220px] rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-amber-400"
        >
          <option value="">ทุกบริการ</option>
          {(data?.services ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={branch}
          onChange={(e) => { setBranch(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-amber-400"
        >
          <option value="">ทุกสาขา</option>
          {(data?.branches ?? []).map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        <select
          value={partnerType}
          onChange={(e) => { setPartnerType(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-amber-400"
        >
          <option value="">ทุกประเภทรถร่วม</option>
          {(data?.partnerTypes ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQ(qDraft.trim()); setPage(1) } }}
            placeholder="ค้นหา LDT / subcode / ทะเบียน..."
            className="h-9 w-52 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
              pl-8 pr-7 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-amber-400"
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
          className="flex h-9 items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800/50
            bg-amber-50 dark:bg-amber-950/30 px-3 text-[13px] font-medium
            text-amber-700 dark:text-amber-300 disabled:opacity-50
            hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {running ? "กำลังคำนวณ..." : "คำนวณใหม่ (ETL)"}
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
          {data?.rulesVersion != null && <span>rules v{data.rulesVersion}</span>}
          {data?.computedAt && <span>คำนวณล่าสุด {new Date(data.computedAt).toLocaleString("th-TH")}</span>}
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
            กด &quot;คำนวณใหม่ (ETL)&quot; เพื่อประมวลผลจาก driverCost
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
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        className={`sticky top-0 z-10 border-b border-gray-200 dark:border-white/8
                          bg-gray-50 dark:bg-[#181c26] px-3 py-2.5 font-semibold
                          text-gray-500 dark:text-gray-400 ${c.numeric ? "text-right" : "text-left"}`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={loading ? "opacity-50" : ""}>
                  {(data?.rows ?? []).map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100 dark:border-white/5 last:border-0
                        hover:bg-gray-50 dark:hover:bg-white/4 transition-colors"
                    >
                      {COLUMNS.map((c) => {
                        const v = row[c.key]
                        if (c.key === "fuelType") {
                          return (
                            <td key={c.key} className="px-3 py-2">
                              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${FUEL_TONE[row.fuelType] ?? ""}`}>
                                {row.fuelType}
                              </span>
                            </td>
                          )
                        }
                        return (
                          <td
                            key={c.key}
                            className={`px-3 py-2 text-gray-700 dark:text-gray-300
                              ${c.numeric ? "text-right tabular-nums" : ""}
                              ${c.strong ? "font-semibold text-gray-900 dark:text-white" : ""}`}
                          >
                            {c.numeric ? qty(Number(v ?? 0)) : v != null && v !== "" ? String(v) : "-"}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {data && data.rows.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length} className="p-8 text-center text-gray-400">
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
                หน้า {data.page} / {totalPages.toLocaleString()} · {data.total.toLocaleString()} แถว
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
