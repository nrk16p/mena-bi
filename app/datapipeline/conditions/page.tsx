"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Database,
  FlaskConical,
  Loader2,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  Warehouse,
  X,
} from "lucide-react"

type Rule = {
  id: string
  label: string
  field: string
  operator: "equals" | "contains" | "contains_word"
  values: string[]
  enabled: boolean
  action?: "exclude" | "classify"
  category?: string
}

type RuleDoc = {
  flowKey: string
  name: string
  version: number
  rules: Rule[]
  updatedAt?: string
  updatedBy?: string
  ruleFields: string[]
  categories: string[]
  defaultCategory: string | null
  isAdmin: boolean
}

type Preview = {
  monthKey: string
  rowsScanned: number
  uniqueLdt: number
  trips: number
  excluded: number
  excludedByRule: Record<string, number>
  totalAmount?: number
  byCategory?: Record<string, { rows: number; amount: number }>
}

type FlowInfo = {
  flowKey: string
  name: string
  description: string
  sourceCollection: string
  targetCollection: string
}

const OPERATOR_LABELS: Record<Rule["operator"], string> = {
  equals: "ตรงกับ",
  contains: "มีคำว่า",
  contains_word: "มีคำ (ทั้งคำ)",
}

function monthOptions(count = 24): string[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  })
}

function ConditionsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const flowKey = searchParams.get("flow") ?? "trip"

  const [flows, setFlows] = useState<FlowInfo[]>([])
  const [doc, setDoc] = useState<RuleDoc | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [previewMonth, setPreviewMonth] = useState(monthOptions()[1])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/etl/rules?flowKey=${flowKey}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
      setDoc(json.data)
      setRules(json.data.rules)
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ")
    }
  }, [flowKey])

  useEffect(() => {
    load()
  }, [load])

  // Flow list for the selector — every flow has its own independent rule set
  useEffect(() => {
    fetch("/api/etl/flows")
      .then(async (r) => {
        const json = await r.json()
        if (r.ok) setFlows(json.data)
      })
      .catch(() => {})
  }, [])

  function switchFlow(key: string) {
    if (key === flowKey) return
    if (dirty && !window.confirm("มีการแก้ไขที่ยังไม่บันทึก — ออกจาก flow นี้เลยไหม?")) return
    setPreview(null)
    setNotice(null)
    router.push(`/datapipeline/conditions?flow=${key}`)
  }

  function mutate(next: Rule[]) {
    setRules(next)
    setDirty(true)
    setPreview(null)
    setNotice(null)
  }

  function updateRule(id: string, patch: Partial<Rule>) {
    mutate(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeValue(id: string, value: string) {
    const rule = rules.find((r) => r.id === id)
    if (rule) updateRule(id, { values: rule.values.filter((v) => v !== value) })
  }

  function addValue(id: string, value: string) {
    const v = value.trim()
    const rule = rules.find((r) => r.id === id)
    if (!v || !rule || rule.values.includes(v)) return
    updateRule(id, { values: [...rule.values, v] })
  }

  function addRule() {
    mutate([
      ...rules,
      {
        id: `rule-${Date.now()}`,
        label: "เงื่อนไขใหม่",
        field: doc?.ruleFields[0] ?? "บริการ",
        operator: "equals",
        values: [],
        enabled: true,
      },
    ])
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/etl/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowKey, rules }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "บันทึกไม่สำเร็จ")
      setNotice(`บันทึกแล้ว — version ${json.data.version} (ข้อมูลเดือนเก่ายังเป็น version เดิมจนกว่าจะ run ETL ใหม่)`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ")
    } finally {
      setSaving(false)
    }
  }

  async function runPreview() {
    setPreviewing(true)
    setError(null)
    try {
      const res = await fetch("/api/etl/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowKey, monthKey: previewMonth, rules }),
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

  if (!doc && !error) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-white/8
        bg-white dark:bg-white/3 p-10 text-[13px] text-gray-400">
        <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
      </div>
    )
  }

  return (
    <>
      {/* Flow selector — each flow keeps its own rule set */}
      {flows.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {flows.map((f) => {
            const active = f.flowKey === flowKey
            return (
              <button
                key={f.flowKey}
                onClick={() => switchFlow(f.flowKey)}
                title={f.description}
                className={`flex min-w-[190px] flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors
                  ${active
                    ? "border-violet-400 bg-violet-50 dark:bg-violet-950/40"
                    : "border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 hover:border-violet-300"}`}
              >
                <span className={`text-[13px] font-bold ${active ? "text-violet-700 dark:text-violet-300" : "text-gray-800 dark:text-gray-200"}`}>
                  {f.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                  <Database size={9} /> {f.sourceCollection}
                  <span className="text-gray-300 dark:text-gray-600">→</span>
                  <Warehouse size={9} /> {f.targetCollection}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-violet-100 dark:bg-violet-950/50 px-2.5 py-1 text-[12px] font-semibold
          text-violet-700 dark:text-violet-300">
          {doc?.name} · v{doc?.version}
        </span>
        {doc?.updatedAt && (
          <span className="text-[12px] text-gray-400 dark:text-gray-500">
            แก้ไขล่าสุด {new Date(doc.updatedAt).toLocaleString("th-TH")} โดย {doc.updatedBy}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={addRule}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3
              text-[13px] font-medium text-gray-600 dark:text-gray-300
              hover:bg-gray-50 dark:hover:bg-white/6 transition-colors"
          >
            <Plus size={14} /> เพิ่มเงื่อนไข
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving || !doc?.isAdmin}
            title={doc?.isAdmin ? undefined : "ต้องเป็น admin จึงจะบันทึกได้"}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 text-[13px] font-medium
              text-white disabled:opacity-40 hover:bg-violet-700 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            บันทึก (v{(doc?.version ?? 0) + 1})
          </button>
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

      {/* Rules */}
      <div className="space-y-3">
        {rules.map((rule, index) => (
          <div
            key={rule.id}
            className={`rounded-xl border bg-white dark:bg-white/3 p-3.5 transition-opacity
              ${rule.enabled ? "border-gray-200 dark:border-white/8" : "border-dashed border-gray-300 dark:border-white/12 opacity-60"}`}
          >
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-gray-300 dark:text-gray-600">#{index + 1}</span>
              <input
                value={rule.label}
                onChange={(e) => updateRule(rule.id, { label: e.target.value })}
                className="h-8 min-w-[220px] flex-1 rounded-lg border border-transparent bg-transparent px-2
                  text-[13px] font-semibold text-gray-800 dark:text-gray-200
                  hover:border-gray-200 dark:hover:border-white/10 focus:border-violet-400 outline-none transition-colors"
              />
              <select
                value={rule.field}
                onChange={(e) => updateRule(rule.id, { field: e.target.value })}
                className="h-8 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
                  px-2 text-[12px] text-gray-700 dark:text-gray-200 outline-none"
              >
                {(doc?.ruleFields ?? []).map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <select
                value={rule.operator}
                onChange={(e) => updateRule(rule.id, { operator: e.target.value as Rule["operator"] })}
                className="h-8 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
                  px-2 text-[12px] text-gray-700 dark:text-gray-200 outline-none"
              >
                {Object.entries(OPERATOR_LABELS).map(([op, label]) => (
                  <option key={op} value={op}>{label}</option>
                ))}
              </select>

              {/* Action — only flows with categories can classify */}
              {(doc?.categories.length ?? 0) > 0 && (
                <select
                  value={rule.action ?? "exclude"}
                  onChange={(e) => {
                    const action = e.target.value as Rule["action"]
                    updateRule(rule.id, {
                      action,
                      category: action === "classify" ? (rule.category ?? doc?.categories[0]) : undefined,
                    })
                  }}
                  className="h-8 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5
                    px-2 text-[12px] text-gray-700 dark:text-gray-200 outline-none"
                >
                  <option value="exclude">→ ตัดทิ้ง</option>
                  <option value="classify">→ จัดประเภท</option>
                </select>
              )}
              {rule.action === "classify" && (
                <select
                  value={rule.category ?? ""}
                  onChange={(e) => updateRule(rule.id, { category: e.target.value })}
                  className="h-8 rounded-lg border border-emerald-200 dark:border-emerald-800/50
                    bg-emerald-50 dark:bg-emerald-950/30 px-2 text-[12px]
                    text-emerald-700 dark:text-emerald-300 outline-none"
                >
                  {(doc?.categories ?? []).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}

              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                  className="h-3.5 w-3.5 accent-violet-600"
                />
                เปิดใช้
              </label>
              <button
                onClick={() => mutate(rules.filter((r) => r.id !== rule.id))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 dark:text-gray-600
                  hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Values as chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {rule.values.map((v) => (
                <span
                  key={v}
                  className="flex items-center gap-1 rounded-md bg-gray-100 dark:bg-white/8 px-2 py-1
                    text-[12px] text-gray-700 dark:text-gray-300"
                >
                  {v}
                  <button
                    onClick={() => removeValue(rule.id, v)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                placeholder="+ เพิ่มค่า แล้วกด Enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addValue(rule.id, e.currentTarget.value)
                    e.currentTarget.value = ""
                  }
                }}
                className="h-7 w-44 rounded-md border border-dashed border-gray-300 dark:border-white/15
                  bg-transparent px-2 text-[12px] text-gray-700 dark:text-gray-200
                  placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:border-violet-400 outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Preview (dry-run) */}
      <div className="mt-5 rounded-xl border border-violet-200 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-950/20 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <FlaskConical size={15} className="text-violet-500" />
          <span className="text-[13px] font-semibold text-violet-800 dark:text-violet-300">
            ทดลองเงื่อนไขปัจจุบัน (dry-run — ไม่บันทึกข้อมูล)
          </span>
          <select
            value={previewMonth}
            onChange={(e) => setPreviewMonth(e.target.value)}
            className="h-8 rounded-lg border border-violet-200 dark:border-violet-800/50 bg-white dark:bg-white/5
              px-2 text-[12px] text-gray-700 dark:text-gray-200 outline-none"
          >
            {monthOptions().map((mk) => (
              <option key={mk} value={mk}>{mk}</option>
            ))}
          </select>
          <button
            onClick={runPreview}
            disabled={previewing}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-violet-300 dark:border-violet-700
              bg-white dark:bg-white/5 px-3 text-[12px] font-medium text-violet-700 dark:text-violet-300
              disabled:opacity-50 hover:bg-violet-100 dark:hover:bg-violet-950/40 transition-colors"
          >
            {previewing ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
            {previewing ? "กำลังคำนวณ..." : "Preview"}
          </button>
        </div>

        {preview && (
          <div className="mt-3 space-y-1 text-[13px]">
            <p className="text-gray-700 dark:text-gray-300">
              เดือน {preview.monthKey}: {doc?.defaultCategory ? "แถวในเดือน" : "unique LDT"}{" "}
              <b className="tabular-nums">{preview.uniqueLdt.toLocaleString()}</b> →{" "}
              {doc?.defaultCategory ? "นับ" : "นับเป็นเที่ยว"}{" "}
              <b className="tabular-nums text-violet-700 dark:text-violet-300">{preview.trips.toLocaleString()}</b>{" "}
              / ตัดออก <b className="tabular-nums text-red-500">{preview.excluded.toLocaleString()}</b>
            </p>
            {preview.byCategory && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {Object.entries(preview.byCategory).map(([cat, v]) => (
                  <span key={cat} className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 text-[11px]
                    text-emerald-800 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/40">
                    {cat}: <b className="tabular-nums">{v.amount.toLocaleString()}</b> ({v.rows.toLocaleString()} แถว)
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {Object.entries(preview.excludedByRule).map(([label, n]) => (
                <span key={label} className="rounded-md bg-white dark:bg-white/8 px-2 py-1 text-[11px]
                  text-gray-600 dark:text-gray-300 border border-violet-100 dark:border-violet-900/40">
                  {label}: <b className="tabular-nums">{n.toLocaleString()}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default function ConditionsPage() {
  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-950/50">
          <SlidersHorizontal size={18} className="text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Conditions</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            จัดการเงื่อนไขตัดข้อมูล (Condition &amp; Process) — บันทึกแล้วจะได้ version ใหม่ ต้อง run ETL ซ้ำเพื่อใช้กับข้อมูล
          </p>
        </div>
      </div>
      <Suspense>
        <ConditionsContent />
      </Suspense>
    </div>
  )
}
