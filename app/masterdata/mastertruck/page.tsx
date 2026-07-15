"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import * as XLSX from "xlsx"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
  Truck,
  Upload,
} from "lucide-react"

type MasterRow = Record<string, string | number | null>

type ApiData = {
  rows: MasterRow[]
  total: number
  page: number
  pageSize: number
  months: string[]
  isAdmin: boolean
}

const COLUMNS = ["YM", "ศูนย์", "บริการ", "ทะเบียนรถ", "Fleet", "Site", "เชื้อเพลิง", "Type"]
const PAGE_SIZE = 50

function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export default function MasterTruckPage() {
  const [monthKey, setMonthKey] = useState("all")
  const [q, setQ] = useState("")
  const [qDraft, setQDraft] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ApiData | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ monthKey, page: String(page), pageSize: String(PAGE_SIZE) })
      if (q) params.set("q", q)
      const res = await fetch(`/api/master/mastertruck?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [monthKey, q, page])

  useEffect(() => {
    load()
  }, [load])

  async function exportExcel() {
    setBusy("export")
    setError(null)
    try {
      const params = new URLSearchParams({ monthKey, all: "1" })
      if (q) params.set("q", q)
      const res = await fetch(`/api/master/mastertruck?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "export ไม่สำเร็จ")
      const rows: MasterRow[] = json.data.rows
      const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS })
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "mastertruck")
      XLSX.writeFile(wb, `mastertruck-${monthKey === "all" ? "all" : monthKey}.xlsx`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "export ไม่สำเร็จ")
    } finally {
      setBusy(null)
    }
  }

  async function importExcel(file: File) {
    setBusy("import")
    setError(null)
    setNotice(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })
      if (rows.length === 0) throw new Error("file ว่าง — ไม่มีข้อมูล")

      const fallback = monthKey === "all" ? currentMonthKey() : monthKey
      const months = [...new Set(rows.map((r) => String(r["YM"] ?? fallback)))]
      const ok = window.confirm(
        `Import ${rows.length.toLocaleString()} แถว\n` +
          `เดือนที่พบใน file: ${months.join(", ")}\n\n` +
          `⚠️ ข้อมูลเดิมของเดือนเหล่านั้นจะถูกแทนที่ทั้งหมด — ยืนยัน?`
      )
      if (!ok) return

      const res = await fetch("/api/master/mastertruck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, defaultMonthKey: fallback }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "import ไม่สำเร็จ")
      const summary = (json.data as Array<{ monthKey: string; removed: number; inserted: number }>)
        .map((r) => `${r.monthKey}: ลบ ${r.removed} → เพิ่ม ${r.inserted}`)
        .join(" · ")
      setNotice(`Import สำเร็จ — ${summary}`)
      setPage(1)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "import ไม่สำเร็จ")
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const totalPages = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-950/50">
          <Truck size={18} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Master รถ</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            mena-bi.mastertruck — จัดการรายเดือน (import แทนที่ทั้งเดือน)
          </p>
        </div>
      </div>

      {/* Filters + actions */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={monthKey}
          onChange={(e) => { setMonthKey(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
            px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-indigo-400"
        >
          <option value="all">ทุกเดือน</option>
          {(data?.months ?? []).map((mk) => (
            <option key={mk} value={mk}>{mk}</option>
          ))}
        </select>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setQ(qDraft.trim()); setPage(1) } }}
            placeholder="ค้นหา ทะเบียน/บริการ/ศูนย์..."
            className="h-9 w-56 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
              pl-8 pr-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-indigo-400"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {data && (
            <span className="mr-1 text-[12px] text-gray-400 dark:text-gray-500">
              {data.total.toLocaleString()} แถว
            </span>
          )}
          <button
            onClick={exportExcel}
            disabled={busy !== null || !data || data.total === 0}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3
              text-[13px] font-medium text-gray-600 dark:text-gray-300 disabled:opacity-40
              hover:bg-gray-50 dark:hover:bg-white/6 transition-colors"
          >
            {busy === "export" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Export Excel
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null || !data?.isAdmin}
            title={data?.isAdmin ? undefined : "ต้องเป็น admin จึงจะ import ได้"}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-[13px] font-medium
              text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors"
          >
            {busy === "import" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Import Excel
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importExcel(f) }}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30
          px-3 py-2 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30
          px-3 py-2 text-[13px] text-emerald-700 dark:text-emerald-400">
          {notice}
        </div>
      )}

      {/* Table */}
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
                  {COLUMNS.map((c) => (
                    <th
                      key={c}
                      className="sticky top-0 z-10 border-b border-gray-200 dark:border-white/8
                        bg-gray-50 dark:bg-[#181c26] px-3 py-2.5 text-left font-semibold
                        text-gray-500 dark:text-gray-400"
                    >
                      {c}
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
                    {COLUMNS.map((c) => (
                      <td key={c} className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {row[c] != null && row[c] !== "" ? String(row[c]) : "-"}
                      </td>
                    ))}
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
