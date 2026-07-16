"use client"

import { useCallback, useEffect, useState } from "react"
import * as XLSX from "xlsx"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react"
import { BackLink } from "@/components/back-link"

type DriverCostRow = {
  monthKey: string
  issueDate: string | null
  ldt: string | null
  service: string
  subcode: string | null
  zone: string | null
  branch: string | null
  partnerType: string | null
  driver1: string | null
  driver2: string | null
  fee1: number
  fee2: number
  fee: number
  computedAt?: string
}

type ApiData = {
  rows: DriverCostRow[]
  total: number
  page: number
  pageSize: number
  partnerTypes: string[]
  services: string[]
  branches: string[]
  zones: string[]
  totalFee: number | null
  byPartnerType: Record<string, { rows: number; fee: number }> | null
  computedAt: string | null
  rulesVersion: number | null
}

const COLUMNS: Array<{ key: keyof DriverCostRow; label: string; numeric?: boolean; strong?: boolean }> = [
  { key: "issueDate", label: "ออก LDT" },
  { key: "ldt", label: "LDT" },
  { key: "service", label: "บริการ" },
  { key: "subcode", label: "subcode" },
  { key: "zone", label: "โซน" },
  { key: "branch", label: "สาขา" },
  { key: "partnerType", label: "ประเภทรถร่วม" },
  { key: "driver1", label: "พจส1" },
  { key: "driver2", label: "พจส2" },
  { key: "fee1", label: "ค่าเที่ยว พจส 1", numeric: true },
  { key: "fee2", label: "ค่าเที่ยว พจส 2", numeric: true },
  { key: "fee", label: "ค่าเที่ยว", numeric: true, strong: true },
]

const PAGE_SIZE = 50

function monthOptions(count = 24): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
}

const baht = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })

export default function DriverCostPage() {
  const [monthKey, setMonthKey] = useState(monthOptions()[1])
  const [partnerType, setPartnerType] = useState("")
  const [service, setService] = useState("")
  const [branch, setBranch] = useState("")
  const [zone, setZone] = useState("")
  const [q, setQ] = useState("")
  const [qDraft, setQDraft] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasFilter = !!(partnerType || service || branch || zone || q)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ monthKey, page: String(page), pageSize: String(PAGE_SIZE) })
      if (partnerType) params.set("partnerType", partnerType)
      if (service) params.set("service", service)
      if (branch) params.set("branch", branch)
      if (zone) params.set("zone", zone)
      if (q) params.set("q", q)
      const res = await fetch(`/api/driver-cost-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [monthKey, partnerType, service, branch, zone, q, page])

  useEffect(() => {
    load()
  }, [load])

  async function runEtl() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch("/api/driver-cost-etl", {
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
      if (partnerType) params.set("partnerType", partnerType)
      if (service) params.set("service", service)
      if (branch) params.set("branch", branch)
      if (zone) params.set("zone", zone)
      if (q) params.set("q", q)
      const res = await fetch(`/api/driver-cost-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "export ไม่สำเร็จ")
      const rows = (json.data.rows as DriverCostRow[]).map((r) =>
        Object.fromEntries(COLUMNS.map((c) => [c.label, r[c.key] ?? ""]))
      )
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "driverCost")
      XLSX.writeFile(wb, `driverCost-${monthKey}${hasFilter ? "-filtered" : ""}.xlsx`)
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
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/50">
          <Users size={18} className="text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Master ค่าเที่ยว พจส</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            ค่าเที่ยว = พจส 1 + พจส 2 รายแถว (ไม่ dedupe) — ตัดแถวที่ไม่มีค่าเที่ยว
          </p>
        </div>
      </div>

      {/* Partner type summary */}
      {data?.byPartnerType && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(data.byPartnerType)
            .sort((a, b) => b[1].fee - a[1].fee)
            .map(([name, v]) => (
              <button
                key={name}
                onClick={() => { setPartnerType(partnerType === name ? "" : name); setPage(1) }}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors
                  ${partnerType === name
                    ? "border-rose-400 bg-rose-50/60 dark:bg-rose-950/30"
                    : "border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 hover:border-gray-300 dark:hover:border-white/16"}`}
              >
                <p className="truncate text-[11px] font-semibold text-gray-500 dark:text-gray-400">{name}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-gray-900 dark:text-white">{baht(v.fee)}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">{v.rows.toLocaleString()} แถว</p>
              </button>
            ))}
          {data.totalFee != null && (
            <div className="rounded-xl border border-gray-900/10 dark:border-white/12 bg-gray-900 dark:bg-white/8 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-gray-300 dark:text-gray-400">ค่าเที่ยวรวม</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-white">{baht(data.totalFee)}</p>
              <p className="text-[11px] text-gray-400">{data.total.toLocaleString()} แถว (ตาม filter)</p>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={monthKey}
          onChange={(e) => {
            setMonthKey(e.target.value)
            setPartnerType(""); setService(""); setBranch(""); setZone(""); setQ(""); setQDraft("")
            setPage(1)
          }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-rose-400"
        >
          {monthOptions().map((mk) => <option key={mk} value={mk}>{mk}</option>)}
        </select>

        <select
          value={service}
          onChange={(e) => { setService(e.target.value); setPage(1) }}
          className="h-9 max-w-[220px] rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-rose-400"
        >
          <option value="">ทุกบริการ</option>
          {(data?.services ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={branch}
          onChange={(e) => { setBranch(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-rose-400"
        >
          <option value="">ทุกสาขา</option>
          {(data?.branches ?? []).map((b) => <option key={b} value={b}>{b}</option>)}
        </select>

        <select
          value={zone}
          onChange={(e) => { setZone(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-rose-400"
        >
          <option value="">ทุกโซน</option>
          {(data?.zones ?? []).map((z) => <option key={z} value={z}>{z}</option>)}
        </select>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQ(qDraft.trim()); setPage(1) } }}
            placeholder="ค้นหา LDT / subcode / พจส..."
            className="h-9 w-52 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
              pl-8 pr-7 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-rose-400"
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
          className="flex h-9 items-center gap-2 rounded-lg border border-rose-200 dark:border-rose-800/50
            bg-rose-50 dark:bg-rose-950/30 px-3 text-[13px] font-medium
            text-rose-700 dark:text-rose-300 disabled:opacity-50
            hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors"
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
                        return (
                          <td
                            key={c.key}
                            className={`px-3 py-2 text-gray-700 dark:text-gray-300
                              ${c.numeric ? "text-right tabular-nums" : ""}
                              ${c.strong ? "font-semibold text-rose-700 dark:text-rose-400" : ""}`}
                          >
                            {c.numeric ? baht(Number(v ?? 0)) : v != null && v !== "" ? String(v) : "-"}
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
