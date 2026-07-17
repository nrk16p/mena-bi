"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import * as XLSX from "xlsx"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Download, Gauge, Loader2, RefreshCw } from "lucide-react"

type Agg = {
  group: string
  attrs: Record<string, string>
  perf: Record<string, number>
  rev: Record<string, number>
  revTotal: number
  cost: Record<string, number>
}

type ApiData = {
  groupBy: string
  groupDims: string[]
  perfCols: string[]
  revCols: string[]
  costCols: string[]
  rows: Agg[]
  total: Agg
  attrCols: string[]
}

const REV_COLORS = ["#0891b2", "#7c3aed", "#d97706"]

function monthOptions(count = 24): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
}
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
const qty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })
// cost as a % of that row's revenue (revenue = 100%)
const pctOfRev = (v: number, rev: number) => (rev > 0 ? `${((v / rev) * 100).toFixed(1)}%` : "-")

function PivotContent() {
  const searchParams = useSearchParams()
  const martKey = searchParams.get("mart") ?? "truck-summary"

  const [monthKey, setMonthKey] = useState("2026-05")
  const [groupBy, setGroupBy] = useState("Fleet")
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ martKey, monthKey, groupBy })
      const res = await fetch(`/api/mart-pivot?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [martKey, monthKey, groupBy])

  useEffect(() => {
    load()
  }, [load])

  function exportExcel() {
    if (!data) return
    setExporting(true)
    try {
      const flat = data.rows.map((r) => ({
        [groupBy]: r.group,
        ...(data.attrCols.length ? Object.fromEntries(data.attrCols.map((a) => [a, r.attrs[a] ?? ""])) : {}),
        ...Object.fromEntries(data.perfCols.map((c) => [c, r.perf[c] ?? 0])),
        ...Object.fromEntries(data.revCols.map((c) => [c, r.rev[c] ?? 0])),
        "รวมรายได้": r.revTotal,
        ...Object.fromEntries(
          data.costCols.flatMap((c) => [
            [c, r.cost[c] ?? 0],
            [`${c} %รายได้`, r.revTotal > 0 ? +(((r.cost[c] ?? 0) / r.revTotal) * 100).toFixed(1) : 0],
          ])
        ),
      }))
      const ws = XLSX.utils.json_to_sheet(flat)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "pivot")
      XLSX.writeFile(wb, `pivot-${groupBy}-${monthKey}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  const chartData = useMemo(
    () =>
      (data?.rows ?? []).slice(0, 12).map((r) => ({
        name: r.group.length > 14 ? r.group.slice(0, 13) + "…" : r.group,
        ...Object.fromEntries((data?.revCols ?? []).map((c) => [c, r.rev[c] ?? 0])),
      })),
    [data]
  )

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/50">
          <Gauge size={18} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Pivot Dashboard — Performance · Revenue · Cost</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            สรุปรายรถจัดกลุ่ม — Performance (เที่ยว, น้ำหนัก) · Revenue (ค่าขนส่ง, ค่าโอนย้าย, ประกันรายได้) · Cost (ค่าเที่ยว, ค่าเชื้อเพลิง)
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-indigo-400">
          {monthOptions().map((mk) => <option key={mk} value={mk}>{mk}</option>)}
        </select>
        <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-2 py-1">
          <span className="text-[12px] text-gray-400 dark:text-gray-500">Group by</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}
            className="h-7 rounded-md bg-transparent px-1 text-[13px] font-medium text-indigo-700 dark:text-indigo-300 outline-none">
            {(data?.groupDims ?? ["Fleet", "Site", "Type", "ศูนย์", "เชื้อเพลิง", "ทะเบียนรถ"]).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <button onClick={load} disabled={loading}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3 text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/6 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} รีเฟรช
        </button>
        <button onClick={exportExcel} disabled={exporting || !data || data.rows.length === 0}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3 text-[13px] font-medium text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/6">
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export
        </button>
        {data && <span className="ml-auto text-[12px] text-gray-400 dark:text-gray-500">{data.rows.length} กลุ่ม</span>}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[13px] text-red-600 dark:text-red-400">{error}</div>
      )}

      {/* Revenue composition chart */}
      {data && data.rows.length > 0 && (
        <div className="mb-4 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4">
          <p className="mb-2 text-[12px] font-semibold text-gray-500 dark:text-gray-400">
            องค์ประกอบรายได้ ตาม {groupBy} {data.rows.length > 12 && "(12 อันดับแรก)"}
          </p>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={70}
                  tickFormatter={(v) => Number(v).toLocaleString(undefined, { notation: "compact" })} />
                <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(data.revCols ?? []).map((c, i) => (
                  <Bar key={c} dataKey={c} stackId="rev" fill={REV_COLORS[i % REV_COLORS.length]} radius={i === data.revCols.length - 1 ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Pivot table */}
      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 p-10 text-[13px] text-gray-400">
            <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
          </div>
        ) : data && data.rows.length === 0 ? (
          <div className="p-10 text-center text-[13px] text-gray-400">
            ยังไม่มีข้อมูลเดือน {monthKey} — สร้าง mart (คำนวณ ETL) ก่อน
          </div>
        ) : (
          <div className="max-h-[calc(100vh-430px)] overflow-auto">
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead>
                {/* group header row */}
                <tr>
                  <th className="sticky top-0 left-0 z-20 border-b border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-[#181c26] px-3 py-2 text-left" rowSpan={2}>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{data?.groupBy}</span>
                  </th>
                  {data?.attrCols.map((a) => (
                    <th key={a} rowSpan={2} className="sticky top-0 z-10 border-b border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-[#181c26] px-3 py-2 text-left text-[11px] font-semibold text-gray-400">{a}</th>
                  ))}
                  <th colSpan={data?.perfCols.length} className="sticky top-0 z-10 border-b border-l border-gray-200 dark:border-white/8 bg-cyan-50 dark:bg-cyan-950/30 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Performance</th>
                  <th colSpan={(data?.revCols.length ?? 0) + 1} className="sticky top-0 z-10 border-b border-l border-gray-200 dark:border-white/8 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Revenue</th>
                  <th colSpan={data?.costCols.length} className="sticky top-0 z-10 border-b border-l border-gray-200 dark:border-white/8 bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">Cost</th>
                </tr>
                {/* measure header row */}
                <tr>
                  {data?.perfCols.map((c, i) => (
                    <th key={c} className={`sticky top-[29px] z-10 border-b border-gray-200 dark:border-white/8 bg-cyan-50/60 dark:bg-cyan-950/20 px-3 py-2 text-right text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 ${i === 0 ? "border-l" : ""}`}>{c}</th>
                  ))}
                  {data?.revCols.map((c, i) => (
                    <th key={c} className={`sticky top-[29px] z-10 border-b border-gray-200 dark:border-white/8 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-right text-[11px] font-semibold text-amber-700 dark:text-amber-300 ${i === 0 ? "border-l" : ""}`}>{c}</th>
                  ))}
                  <th className="sticky top-[29px] z-10 border-b border-gray-200 dark:border-white/8 bg-amber-100/70 dark:bg-amber-950/40 px-3 py-2 text-right text-[11px] font-bold text-amber-800 dark:text-amber-200">รวมรายได้</th>
                  {data?.costCols.map((c, i) => (
                    <th key={c} className={`sticky top-[29px] z-10 border-b border-gray-200 dark:border-white/8 bg-rose-50/60 dark:bg-rose-950/20 px-3 py-2 text-right text-[11px] font-semibold text-rose-700 dark:text-rose-300 ${i === 0 ? "border-l" : ""}`}>{c === "ค่าเชื้อเพลิง" ? "ค่าเชื้อเพลิง *" : c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((r, idx) => (
                  <tr key={idx} className="border-b border-gray-100 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/4">
                    <td className="sticky left-0 z-10 bg-white dark:bg-[#12151b] px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{r.group}</td>
                    {data.attrCols.map((a) => (
                      <td key={a} className="px-3 py-2 text-gray-500 dark:text-gray-400">{r.attrs[a] || "-"}</td>
                    ))}
                    {data.perfCols.map((c, i) => (
                      <td key={c} className={`px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300 ${i === 0 ? "border-l border-gray-100 dark:border-white/5" : ""}`}>{qty(r.perf[c] ?? 0)}</td>
                    ))}
                    {data.revCols.map((c, i) => (
                      <td key={c} className={`px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300 ${i === 0 ? "border-l border-gray-100 dark:border-white/5" : ""}`}>{money(r.rev[c] ?? 0)}</td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">{money(r.revTotal)}</td>
                    {data.costCols.map((c, i) => (
                      <td key={c} className={`px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300 ${i === 0 ? "border-l border-gray-100 dark:border-white/5" : ""}`}>
                        <div>{money(r.cost[c] ?? 0)}</div>
                        <div className="text-[10px] font-normal text-rose-500/80 dark:text-rose-400/70">{pctOfRev(r.cost[c] ?? 0, r.revTotal)}</div>
                      </td>
                    ))}
                  </tr>
                ))}
                {data && (
                  <tr className="bg-gray-100 dark:bg-white/8 font-bold">
                    <td className="sticky left-0 z-10 bg-gray-100 dark:bg-[#1c2129] px-3 py-2.5 text-gray-900 dark:text-white">{data.total.group}</td>
                    {data.attrCols.map((a) => <td key={a} />)}
                    {data.perfCols.map((c, i) => (
                      <td key={c} className={`px-3 py-2.5 text-right tabular-nums text-gray-900 dark:text-white ${i === 0 ? "border-l border-gray-200 dark:border-white/8" : ""}`}>{qty(data.total.perf[c] ?? 0)}</td>
                    ))}
                    {data.revCols.map((c, i) => (
                      <td key={c} className={`px-3 py-2.5 text-right tabular-nums text-gray-900 dark:text-white ${i === 0 ? "border-l border-gray-200 dark:border-white/8" : ""}`}>{money(data.total.rev[c] ?? 0)}</td>
                    ))}
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-800 dark:text-amber-300">{money(data.total.revTotal)}</td>
                    {data.costCols.map((c, i) => (
                      <td key={c} className={`px-3 py-2.5 text-right tabular-nums text-gray-900 dark:text-white ${i === 0 ? "border-l border-gray-200 dark:border-white/8" : ""}`}>
                        <div>{money(data.total.cost[c] ?? 0)}</div>
                        <div className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">{pctOfRev(data.total.cost[c] ?? 0, data.total.revTotal)}</div>
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.rows.length > 0 && (
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
          * ค่าเชื้อเพลิง = ปริมาณ Oil/NGV × ราคาน้ำมัน/ลิตร (จาก Master ราคาน้ำมัน ตาม YM × เชื้อเพลิง)
        </p>
      )}
    </div>
  )
}

export default function PivotPage() {
  return (
    <div className="max-w-full">
      <Suspense>
        <PivotContent />
      </Suspense>
    </div>
  )
}
