"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Database, Loader2 } from "lucide-react"

type DeliverRow = Record<string, string | number | null>

type ApiData = {
  columns: string[]
  rows: DeliverRow[]
  total: number
  page: number
  pageSize: number
  branches: string[]
}

function monthOptions(count = 24): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
}

function formatCell(value: string | number | null): string {
  if (value == null || value === "") return "-"
  if (typeof value === "number") return value.toLocaleString()
  return String(value)
}

const PAGE_SIZE = 50

export default function DatasourcePage() {
  const [monthKey, setMonthKey] = useState(monthOptions()[0])
  const [branch, setBranch] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        monthKey,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      })
      if (branch) params.set("branch", branch)
      const res = await fetch(`/api/deliver-result?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [monthKey, branch, page])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/50">
          <Database size={18} className="text-sky-600 dark:text-sky-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Datasource — deliverResult</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            ข้อมูลดิบรายงานผลการจัดส่งจาก ATMS (db mena-bi.deliverResult)
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={monthKey}
          onChange={(e) => { setMonthKey(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-sky-400"
        >
          {monthOptions().map((mk) => (
            <option key={mk} value={mk}>{mk}</option>
          ))}
        </select>

        <select
          value={branch}
          onChange={(e) => { setBranch(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-sky-400"
        >
          <option value="">ทุกสาขา</option>
          {(data?.branches ?? []).map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        {data && (
          <span className="ml-auto text-[12px] text-gray-400 dark:text-gray-500">
            {data.total.toLocaleString()} แถว
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-[13px] text-red-500">{error}</div>
        ) : loading && !data ? (
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
                  <tr
                    key={i}
                    className="border-b border-gray-100 dark:border-white/5 last:border-0
                      hover:bg-gray-50 dark:hover:bg-white/4 transition-colors"
                  >
                    {(data?.columns ?? []).map((c) => (
                      <td key={c} className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {formatCell(row[c] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))}
                {data && data.rows.length === 0 && (
                  <tr>
                    <td colSpan={data.columns.length} className="p-8 text-center text-gray-400">
                      ไม่มีข้อมูลในเดือนนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-white/8 px-3 py-2">
            <span className="text-[12px] text-gray-400 dark:text-gray-500">
              หน้า {data.page} / {totalPages.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1 || loading}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10
                  text-gray-500 dark:text-gray-400 disabled:opacity-40
                  hover:bg-gray-50 dark:hover:bg-white/6 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages || loading}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-white/10
                  text-gray-500 dark:text-gray-400 disabled:opacity-40
                  hover:bg-gray-50 dark:hover:bg-white/6 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
