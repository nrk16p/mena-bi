"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  FlaskConical,
  Loader2,
  Plus,
  SlidersHorizontal,
  Trash2,
  Warehouse,
  X,
} from "lucide-react"

type Source = {
  collection: string
  label: string
  fields: string[]
  months: Array<{ monthKey: string; rows: number }>
  lastSync: string | null
  empty: boolean
}

type Rule = {
  id: string
  label: string
  field: string
  operator: "equals" | "contains" | "contains_word"
  values: string[]
  enabled: boolean
}

type Preview = {
  monthKey: string
  rowsScanned: number
  uniqueLdt: number
  trips: number
  excluded: number
  excludedByRule: Record<string, number>
}

const OPERATOR_LABELS = {
  equals: "ตรงกับ",
  contains: "มีคำว่า",
  contains_word: "มีคำ (ทั้งคำ)",
} as const

const FILE_MONTH = "__file_month__"
const NO_DEDUPE = "__none__"

function monthOptions(count = 24): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
}

const STEPS = [
  { n: 1, title: "Datasource", icon: Database },
  { n: 2, title: "Process", icon: Warehouse },
  { n: 3, title: "Conditions & Create", icon: SlidersHorizontal },
]

export default function NewFlowPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [sources, setSources] = useState<Source[]>([])
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [sourceCollection, setSourceCollection] = useState("")
  const [name, setName] = useState("")
  const [flowKey, setFlowKey] = useState("")
  const [description, setDescription] = useState("")

  // Step 2
  const [columns, setColumns] = useState<string[]>([])
  const [monthField, setMonthField] = useState<string>(FILE_MONTH)
  const [dedupeField, setDedupeField] = useState<string>(NO_DEDUPE)

  // Step 3
  const [rules, setRules] = useState<Rule[]>([])
  const [previewMonth, setPreviewMonth] = useState(monthOptions()[1])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch("/api/etl/sources")
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error ?? "โหลด datasource ไม่สำเร็จ")
        setSources(json.data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลด datasource ไม่สำเร็จ"))
  }, [])

  const source = useMemo(
    () => sources.find((s) => s.collection === sourceCollection) ?? null,
    [sources, sourceCollection]
  )

  function pickSource(s: Source) {
    setSourceCollection(s.collection)
    setColumns(s.fields)
    setMonthField(s.fields.includes("ออก LDT") ? "ออก LDT" : FILE_MONTH)
    setDedupeField(s.fields.includes("_ldt_base") ? "_ldt_base" : NO_DEDUPE)
    setRules([])
    setPreview(null)
  }

  const flowKeyValid = /^[a-z0-9][a-z0-9-]{2,39}$/.test(flowKey)
  const step1Ok = !!sourceCollection && name.trim().length > 0 && flowKeyValid
  const step2Ok = columns.length > 0

  const draft = {
    sourceCollection,
    monthField: monthField === FILE_MONTH ? null : monthField,
    dedupeField: dedupeField === NO_DEDUPE ? null : dedupeField,
    columns,
  }

  function toggleColumn(f: string) {
    setColumns((prev) => (prev.includes(f) ? prev.filter((c) => c !== f) : [...prev, f]))
    setPreview(null)
  }

  function updateRule(id: string, patch: Partial<Rule>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    setPreview(null)
  }

  async function runPreview() {
    setPreviewing(true)
    setError(null)
    try {
      const res = await fetch("/api/etl/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, monthKey: previewMonth, rules }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "preview ไม่สำเร็จ")
      setPreview(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "preview ไม่สำเร็จ")
    } finally {
      setPreviewing(false)
    }
  }

  async function create() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/etl/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowKey, name, description, ...draft, rules }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "สร้าง flow ไม่สำเร็จ")

      // First run for the previewed month so the new Data has content
      await fetch("/api/etl/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowKey, from: previewMonth, to: previewMonth }),
      })
      router.push("/datapipeline/flows")
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง flow ไม่สำเร็จ")
      setCreating(false)
    }
  }

  const inputCls = `h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
    px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-sky-400`

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/50">
          <Plus size={18} className="text-sky-600 dark:text-sky-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">สร้าง Flow ใหม่</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            เลือก Datasource → กำหนด Process → สร้างเงื่อนไข แล้วได้ Data ใหม่ใน warehouse
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-5 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <ArrowRight size={14} className="text-gray-300 dark:text-gray-600" />}
            <div
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold
                ${step === s.n
                  ? "bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300"
                  : step > s.n
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-gray-400 dark:text-gray-500"}`}
            >
              {step > s.n ? <Check size={13} /> : <s.icon size={13} />}
              {s.n}. {s.title}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30
          px-3 py-2 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── Step 1: Datasource ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {sources.map((s) => (
              <button
                key={s.collection}
                onClick={() => pickSource(s)}
                className={`rounded-xl border p-4 text-left transition-colors
                  ${sourceCollection === s.collection
                    ? "border-sky-400 bg-sky-50/60 dark:bg-sky-950/30"
                    : "border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 hover:border-sky-300"}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <Database size={14} className="text-sky-500" />
                  <span className="text-[13px] font-bold text-gray-900 dark:text-white">{s.collection}</span>
                </div>
                <p className="mb-2 text-[12px] text-gray-400 dark:text-gray-500">{s.label}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  {s.fields.length} fields ·{" "}
                  {s.months.map((mm) => `${mm.monthKey}: ${mm.rows.toLocaleString()}`).join(" · ")}
                </p>
              </button>
            ))}
            {sources.length === 0 && !error && (
              <div className="flex items-center gap-2 p-6 text-[13px] text-gray-400">
                <Loader2 size={14} className="animate-spin" /> กำลังโหลด datasource...
              </div>
            )}
          </div>

          <div className="grid gap-3 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">ชื่อ Flow</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น Trip รถโม่"
                className={`${inputCls} w-full`} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">
                flowKey (a-z, 0-9, -) → เก็บที่ dw_&lt;flowKey&gt;
              </span>
              <input value={flowKey} onChange={(e) => setFlowKey(e.target.value.toLowerCase())} placeholder="เช่น mixer-trip"
                className={`${inputCls} w-full font-mono ${flowKey && !flowKeyValid ? "border-red-400" : ""}`} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">คำอธิบาย</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="อธิบายว่า Data นี้คืออะไร" className={`${inputCls} w-full`} />
            </label>
          </div>
        </div>
      )}

      {/* ── Step 2: Process ── */}
      {step === 2 && source && (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">
                นับเดือน (month-year) จาก
              </span>
              <select value={monthField} onChange={(e) => { setMonthField(e.target.value); setPreview(null) }}
                className={`${inputCls} w-full`}>
                <option value={FILE_MONTH}>เดือนของไฟล์รายงาน (_year/_month)</option>
                {source.fields.map((f) => (
                  <option key={f} value={f}>field: {f}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">
                นับไม่ซ้ำด้วย (dedupe key)
              </span>
              <select value={dedupeField} onChange={(e) => { setDedupeField(e.target.value); setPreview(null) }}
                className={`${inputCls} w-full`}>
                <option value={NO_DEDUPE}>ไม่ dedupe — เก็บทุกแถว</option>
                {source.fields.map((f) => (
                  <option key={f} value={f}>field: {f}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-gray-500 dark:text-gray-400">
                คอลัมน์ที่เก็บลง Data ({columns.length}/{source.fields.length})
              </span>
              <div className="flex gap-2">
                <button onClick={() => { setColumns(source.fields); setPreview(null) }}
                  className="text-[12px] text-sky-600 dark:text-sky-400 hover:underline">เลือกทั้งหมด</button>
                <button onClick={() => { setColumns([]); setPreview(null) }}
                  className="text-[12px] text-gray-400 hover:underline">ล้าง</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {source.fields.map((f) => (
                <button
                  key={f}
                  onClick={() => toggleColumn(f)}
                  className={`rounded-md px-2 py-1 text-[12px] transition-colors
                    ${columns.includes(f)
                      ? "bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300"
                      : "bg-gray-100 dark:bg-white/8 text-gray-400 dark:text-gray-500"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Conditions & Create ── */}
      {step === 3 && (
        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div key={rule.id}
              className={`rounded-xl border bg-white dark:bg-white/3 p-3.5
                ${rule.enabled ? "border-gray-200 dark:border-white/8" : "border-dashed opacity-60"}`}>
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-gray-300 dark:text-gray-600">#{index + 1}</span>
                <input value={rule.label} onChange={(e) => updateRule(rule.id, { label: e.target.value })}
                  className="h-8 min-w-[180px] flex-1 rounded-lg border border-transparent bg-transparent px-2
                    text-[13px] font-semibold text-gray-800 dark:text-gray-200
                    hover:border-gray-200 dark:hover:border-white/10 focus:border-violet-400 outline-none" />
                <select value={rule.field} onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                  className="h-8 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 text-[12px]">
                  {columns.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select value={rule.operator}
                  onChange={(e) => updateRule(rule.id, { operator: e.target.value as Rule["operator"] })}
                  className="h-8 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-2 text-[12px]">
                  {Object.entries(OPERATOR_LABELS).map(([op, label]) => <option key={op} value={op}>{label}</option>)}
                </select>
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-gray-500">
                  <input type="checkbox" checked={rule.enabled}
                    onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                    className="h-3.5 w-3.5 accent-violet-600" /> เปิดใช้
                </label>
                <button onClick={() => { setRules(rules.filter((r) => r.id !== rule.id)); setPreview(null) }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {rule.values.map((v) => (
                  <span key={v} className="flex items-center gap-1 rounded-md bg-gray-100 dark:bg-white/8 px-2 py-1 text-[12px]">
                    {v}
                    <button onClick={() => updateRule(rule.id, { values: rule.values.filter((x) => x !== v) })}
                      className="text-gray-400 hover:text-red-500"><X size={11} /></button>
                  </span>
                ))}
                <input placeholder="+ เพิ่มค่า แล้วกด Enter"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = e.currentTarget.value.trim()
                      if (v && !rule.values.includes(v)) updateRule(rule.id, { values: [...rule.values, v] })
                      e.currentTarget.value = ""
                    }
                  }}
                  className="h-7 w-44 rounded-md border border-dashed border-gray-300 dark:border-white/15 bg-transparent px-2 text-[12px] outline-none focus:border-violet-400" />
              </div>
            </div>
          ))}

          <button
            onClick={() => setRules([...rules, {
              id: `rule-${Date.now()}`, label: "เงื่อนไขใหม่", field: columns[0] ?? "",
              operator: "equals", values: [], enabled: true,
            }])}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3
              text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/6"
          >
            <Plus size={14} /> เพิ่มเงื่อนไข (ไม่มีเงื่อนไข = เก็บทุกแถว)
          </button>

          {/* Preview */}
          <div className="rounded-xl border border-violet-200 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-950/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <FlaskConical size={15} className="text-violet-500" />
              <span className="text-[13px] font-semibold text-violet-800 dark:text-violet-300">
                Preview ก่อนสร้าง (dry-run)
              </span>
              <select value={previewMonth} onChange={(e) => { setPreviewMonth(e.target.value); setPreview(null) }}
                className="h-8 rounded-lg border border-violet-200 dark:border-violet-800/50 bg-white dark:bg-white/5 px-2 text-[12px]">
                {monthOptions().map((mk) => <option key={mk} value={mk}>{mk}</option>)}
              </select>
              <button onClick={runPreview} disabled={previewing}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-violet-300 dark:border-violet-700
                  bg-white dark:bg-white/5 px-3 text-[12px] font-medium text-violet-700 dark:text-violet-300
                  disabled:opacity-50 hover:bg-violet-100 dark:hover:bg-violet-950/40">
                {previewing ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                {previewing ? "กำลังคำนวณ..." : "Preview"}
              </button>
            </div>
            {preview && (
              <div className="mt-3 space-y-1 text-[13px]">
                <p className="text-gray-700 dark:text-gray-300">
                  เดือน {preview.monthKey}: candidates{" "}
                  <b className="tabular-nums">{preview.uniqueLdt.toLocaleString()}</b> → เก็บ{" "}
                  <b className="tabular-nums text-violet-700 dark:text-violet-300">{preview.trips.toLocaleString()}</b>{" "}
                  / ตัดออก <b className="tabular-nums text-red-500">{preview.excluded.toLocaleString()}</b>
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {Object.entries(preview.excludedByRule).map(([label, n]) => (
                    <span key={label} className="rounded-md bg-white dark:bg-white/8 px-2 py-1 text-[11px] border border-violet-100 dark:border-violet-900/40">
                      {label}: <b className="tabular-nums">{n.toLocaleString()}</b>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nav buttons */}
      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={() => (step === 1 ? router.push("/datapipeline/flows") : setStep(step - 1))}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3
            text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/6"
        >
          <ArrowLeft size={14} /> {step === 1 ? "ยกเลิก" : "ย้อนกลับ"}
        </button>

        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 ? !step1Ok : !step2Ok}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-4 text-[13px] font-medium text-white
              disabled:opacity-40 hover:bg-sky-700"
          >
            ถัดไป <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={create}
            disabled={creating || !preview}
            title={preview ? undefined : "กด Preview ก่อนสร้าง"}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-[13px] font-medium text-white
              disabled:opacity-40 hover:bg-emerald-700"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            สร้าง Flow + run เดือน {previewMonth}
          </button>
        )}
      </div>
    </div>
  )
}
