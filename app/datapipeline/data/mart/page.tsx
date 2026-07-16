"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import * as XLSX from "xlsx"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react"

type Row = Record<string, string | number | null | Record<string, number>>

type ApiData = {
  mart: { martKey: string; name: string; description: string }
  columns: string[]
  numericCols: string[]
  measureCols: string[]
  rows: Row[]
  total: number
  page: number
  pageSize: number
  filterOptions: Record<string, string[]>
  series: Array<{ monthKey: string; value: number }> | null
  computedAt: string | null
}

const PAGE_SIZE = 50
const FILTER_DIMS = ["Fleet", "Type", "fuelType", "ศูนย์"] as const

function monthOptions(count = 24): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
}

const fmt = (v: unknown) => {
  if (v == null || v === "") return "-"
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (typeof v === "object") return Object.entries(v).map(([k, n]) => `${k}: ${Number(n).toLocaleString()}`).join(", ")
  return String(v)
}

function MartContent() {
  const searchParams = useSearchParams()
  const martKey = searchParams.get("mart") ?? "truck-summary"

  const [monthKey, setMonthKey] = useState(monthOptions()[1])
  const [dims, setDims] = useState<Record<string, string>>({})
  const [q, setQ] = useState("")
  const [qDraft, setQDraft] = useState("")
  const [page, setPage] = useState(1)
  const [trend, setTrend] = useState("")
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buildParams = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams({ martKey, monthKey, ...extra })
      for (const [k, v] of Object.entries(dims)) if (v) p.set(k, v)
      if (q) p.set("q", q)
      return p
    },
    [martKey, monthKey, dims, q]
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = buildParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (trend) params.set("trend", trend)
      const res = await fetch(`/api/mart-data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
      setData(json.data)
      if (!trend && json.data.measureCols?.length) setTrend(json.data.measureCols[0])
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [buildParams, page, trend])

  useEffect(() => {
    load()
  }, [load])

  async function runEtl() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch("/api/mart-etl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ martKey, from: monthKey, to: monthKey }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "คำนวณไม่สำเร็จ")
      const r = json.data?.[0]
      if (r?.status === "error") throw new Error(r.error ?? "mart ETL ล้มเหลว")
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
    try {
      const res = await fetch(`/api/mart-data?${buildParams({ all: "1" })}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "export ไม่สำเร็จ")
      const cols: string[] = json.data.columns
      const rows = (json.data.rows as Row[]).map((r) =>
        Object.fromEntries(cols.map((c) => [c, typeof r[c] === "object" ? fmt(r[c]) : (r[c] ?? "")]))
      )
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "mart")
      XLSX.writeFile(wb, `${martKey}-${monthKey}.xlsx`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "export ไม่สำเร็จ")
    } finally {
      setExporting(false)
    }
  }

  const totalPages = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1
  const chartData = useMemo(
    () => (data?.series ?? []).map((s) => ({ month: s.monthKey, value: s.value })),
    [data]
  )
  const hasFilter = Object.values(dims).some(Boolean) || !!q

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-950/50">
          <Layers size={18} className="text-cyan-600 dark:text-cyan-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">{data?.mart.name ?? "Data Mart"}</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            {data?.mart.description ?? "รวมข้อมูลจากหลายแหล่ง (snowflake schema)"}
          </p>
        </div>
      </div>

      {/* Chart */}
      {data && data.measureCols.length > 0 && (
        <div className="mb-4 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-gray-500 dark:text-gray-400">แนวโน้มรายเดือน (MoM)</span>
            <select
              value={trend}
              onChange={(e) => setTrend(e.target.value)}
              className="h-8 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
                px-2 text-[12px] text-gray-700 dark:text-gray-200 outline-none focus:border-cyan-400"
            >
              {data.measureCols.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            {hasFilter && <span className="text-[11px] text-gray-400">(ตาม filter ปัจจุบัน)</span>}
          </div>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              {chartData.length > 1 ? (
                <LineChart data={chartData} margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e5e7eb)" opacity={0.4} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={70}
                    tickFormatter={(v) => Number(v).toLocaleString(undefined, { notation: "compact" })} />
                  <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                  <Line type="monotone" dataKey="value" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.4} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={70}
                    tickFormatter={(v) => Number(v).toLocaleString(undefined, { notation: "compact" })} />
                  <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                  <Bar dataKey="value" fill="#0891b2" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={monthKey}
          onChange={(e) => { setMonthKey(e.target.value); setDims({}); setQ(""); setQDraft(""); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-cyan-400"
        >
          {monthOptions().map((mk) => <option key={mk} value={mk}>{mk}</option>)}
        </select>

        {FILTER_DIMS.map((dim) => (
          <select
            key={dim}
            value={dims[dim] ?? ""}
            onChange={(e) => { setDims((d) => ({ ...d, [dim]: e.target.value })); setPage(1) }}
            className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
              px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-cyan-400"
          >
            <option value="">ทุก {dim}</option>
            {(data?.filterOptions?.[dim] ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQ(qDraft.trim()); setPage(1) } }}
            placeholder="ค้นหา ทะเบียน / บริการ..."
            className="h-9 w-48 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
              pl-8 pr-7 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-cyan-400"
          />
          {q && (
            <button onClick={() => { setQ(""); setQDraft(""); setPage(1) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500">
              <X size={13} />
            </button>
          )}
        </div>

        <button onClick={runEtl} disabled={running || loading}
          className="flex h-9 items-center gap-2 rounded-lg border border-cyan-200 dark:border-cyan-800/50
            bg-cyan-50 dark:bg-cyan-950/30 px-3 text-[13px] font-medium text-cyan-700 dark:text-cyan-300
            disabled:opacity-50 hover:bg-cyan-100 dark:hover:bg-cyan-950/50 transition-colors">
          {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {running ? "กำลังคำนวณ..." : "คำนวณใหม่"}
        </button>
        <button onClick={exportExcel} disabled={exporting || !data || data.total === 0}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3
            text-[13px] font-medium text-gray-600 dark:text-gray-300 disabled:opacity-40
            hover:bg-gray-50 dark:hover:bg-white/6 transition-colors">
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Export
        </button>
        <div className="ml-auto flex items-center gap-3 text-[12px] text-gray-400 dark:text-gray-500">
          {data && <span className="font-semibold text-cyan-600 dark:text-cyan-400 text-[13px]">{data.total.toLocaleString()} แถว</span>}
          {data?.computedAt && <span>{new Date(data.computedAt).toLocaleString("th-TH")}</span>}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30
          px-3 py-2 text-[13px] text-red-600 dark:text-red-400">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 p-10 text-[13px] text-gray-400">
            <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
          </div>
        ) : data && data.total === 0 ? (
          <div className="p-10 text-center text-[13px] text-gray-400">
            ยังไม่มีข้อมูลเดือน {monthKey} — กด &quot;คำนวณใหม่&quot; (ต้องมี Master รถ ของเดือนนั้นก่อน)
          </div>
        ) : (
          <div className="max-h-[calc(100vh-430px)] overflow-auto">
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead>
                <tr>
                  {(data?.columns ?? []).map((c) => {
                    const isNum = data?.numericCols.includes(c)
                    return (
                      <th key={c}
                        className={`sticky top-0 z-10 border-b border-gray-200 dark:border-white/8
                          bg-gray-50 dark:bg-[#181c26] px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400
                          ${isNum ? "text-right" : "text-left"}`}>
                        {c}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className={loading ? "opacity-50" : ""}>
                {(data?.rows ?? []).map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 dark:border-white/5 last:border-0
                    hover:bg-gray-50 dark:hover:bg-white/4 transition-colors">
                    {(data?.columns ?? []).map((c) => {
                      const isNum = data?.numericCols.includes(c)
                      return (
                        <td key={c}
                          className={`px-3 py-2 text-gray-700 dark:text-gray-300 ${isNum ? "text-right tabular-nums" : ""}`}>
                          {fmt(row[c])}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/8 px-3 py-2">
            <span className="text-[12px] text-gray-400 dark:text-gray-500">หน้า {data.page} / {totalPages.toLocaleString()}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1 || loading}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10
                  text-gray-500 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/6"><ChevronLeft size={14} /></button>
              <button onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page >= totalPages || loading}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10
                  text-gray-500 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/6"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MartPage() {
  return (
    <div className="max-w-full">
      <Suspense>
        <MartContent />
      </Suspense>
    </div>
  )
}
