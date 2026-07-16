"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import * as XLSX from "xlsx"
import { ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, Search, Warehouse, X } from "lucide-react"
import { BackLink } from "@/components/back-link"

type ApiData = {
  flow: { flowKey: string; name: string; description: string; targetCollection: string }
  columns: string[]
  rows: Array<Record<string, unknown>>
  total: number
  page: number
  pageSize: number
  computedAt: string | null
  rulesVersion: number | null
}

const PAGE_SIZE = 50

function monthOptions(count = 24): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
}

function formatCell(v: unknown): string {
  if (v == null || v === "") return "-"
  if (typeof v === "number") return v.toLocaleString()
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleDateString("th-TH")
  }
  return String(v)
}

function DataContent() {
  const searchParams = useSearchParams()
  const flowKey = searchParams.get("flow") ?? ""

  const [monthKey, setMonthKey] = useState(monthOptions()[1])
  const [q, setQ] = useState("")
  const [qDraft, setQDraft] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!flowKey) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        flowKey,
        monthKey,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      if (q) params.set("q", q)
      const res = await fetch(`/api/etl/data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [flowKey, monthKey, q, page])

  useEffect(() => {
    load()
  }, [load])

  async function runEtl() {
    setRunning(true)
    setError(null)
    try {
      const res = await fetch("/api/etl/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowKey, from: monthKey, to: monthKey }),
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
    if (!data) return
    setExporting(true)
    setError(null)
    try {
      const params = new URLSearchParams({ flowKey, monthKey, all: "1" })
      if (q) params.set("q", q)
      const res = await fetch(`/api/etl/data?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "export ไม่สำเร็จ")
      const cols: string[] = json.data.columns
      const rows = (json.data.rows as Array<Record<string, unknown>>).map((r) =>
        Object.fromEntries(cols.map((c) => [c, r[c] ?? ""]))
      )
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "data")
      XLSX.writeFile(wb, `${data.flow.targetCollection}-${monthKey}.xlsx`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "export ไม่สำเร็จ")
    } finally {
      setExporting(false)
    }
  }

  const totalPages = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1

  if (!flowKey) {
    return <p className="text-[13px] text-gray-400">ไม่พบ flow — เปิดผ่านหน้า Flows</p>
  }

  return (
    <>
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/50">
          <Warehouse size={18} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            {data?.flow.name ?? flowKey}
          </h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            {data?.flow.description || `mena-bi.${data?.flow.targetCollection ?? ""}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={monthKey}
          onChange={(e) => { setMonthKey(e.target.value); setQ(""); setQDraft(""); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-amber-400"
        >
          {monthOptions().map((mk) => (
            <option key={mk} value={mk}>{mk}</option>
          ))}
        </select>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQ(qDraft.trim()); setPage(1) } }}
            placeholder="ค้นหาทุกคอลัมน์..."
            className="h-9 w-56 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
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
          {data && data.total > 0 && (
            <span className="font-semibold text-amber-600 dark:text-amber-400 text-[13px]">
              {data.total.toLocaleString()} แถว
            </span>
          )}
          {data?.rulesVersion != null && <span>rules v{data.rulesVersion}</span>}
          {data?.computedAt && (
            <span>คำนวณล่าสุด {new Date(data.computedAt).toLocaleString("th-TH")}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30
          px-3 py-2 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {data && data.total === 0 && !loading ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-white/12 p-10 text-center">
          <p className="text-[13px] text-gray-500 dark:text-gray-400">
            ยังไม่มีข้อมูลเดือน {monthKey} — กด &quot;คำนวณใหม่ (ETL)&quot;
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 p-10 text-[13px] text-gray-400">
              <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
            </div>
          ) : (
            <div className="max-h-[calc(100vh-230px)] overflow-auto">
              <table className="w-full text-[12px] whitespace-nowrap">
                <thead>
                  <tr>
                    {(data?.columns ?? []).map((c) => (
                      <th
                        key={c}
                        className="sticky top-0 z-10 border-b border-gray-200 dark:border-white/8
                          bg-gray-50 dark:bg-[#181c26] px-3 py-2.5 text-left font-semibold
                          text-gray-500 dark:text-gray-400"
                      >
                        {c === "_branch" ? "สาขา" : c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={loading ? "opacity-50" : ""}>
                  {(data?.rows ?? []).map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-white/5 last:border-0
                      hover:bg-gray-50 dark:hover:bg-white/4 transition-colors">
                      {(data?.columns ?? []).map((c) => (
                        <td key={c} className="px-3 py-2 text-gray-700 dark:text-gray-300">
                          {formatCell(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.total > 0 && (
            <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/8 px-3 py-2">
              <span className="text-[12px] text-gray-400 dark:text-gray-500">
                หน้า {data.page} / {totalPages.toLocaleString()}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1 || loading}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10
                    text-gray-500 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/6">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page >= totalPages || loading}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10
                    text-gray-500 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-white/6">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default function GenericDataPage() {
  return (
    <div className="max-w-full">
      <BackLink href="/datapipeline/data" label="กลับไปหน้า Data" />
      <Suspense>
        <DataContent />
      </Suspense>
    </div>
  )
}
