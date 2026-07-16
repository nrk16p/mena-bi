"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Database, Layers, Loader2, SlidersHorizontal, Warehouse } from "lucide-react"

type Catalog = {
  measureSources: Record<string, { label: string; numeric: string[]; hasPlateTail: boolean; hasCategory?: string }>
  masterDims: string[]
  conditionFields: string[]
  conditions: Record<string, string[]>
  isAdmin: boolean
}

type MeasurePick = { source: string; fields: string[]; useTail: boolean; groupByCategory: boolean }

export default function NewMartPage() {
  const router = useRouter()
  const [cat, setCat] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [name, setName] = useState("")
  const [martKey, setMartKey] = useState("")
  const [description, setDescription] = useState("")
  const [measures, setMeasures] = useState<Record<string, MeasurePick>>({})
  const [dims, setDims] = useState<string[]>(["Fleet", "Type"])
  const [condField, setCondField] = useState("")
  const [condValues, setCondValues] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/marts?catalog=1")
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? "โหลด catalog ไม่สำเร็จ")
        setCat(j.data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลด catalog ไม่สำเร็จ"))
  }, [])

  function toggleSource(source: string, def: Catalog["measureSources"][string]) {
    setMeasures((m) => {
      const next = { ...m }
      if (next[source]) delete next[source]
      else next[source] = { source, fields: [def.numeric[0]], useTail: false, groupByCategory: !!def.hasCategory }
      return next
    })
  }
  function toggleField(source: string, field: string) {
    setMeasures((m) => {
      const p = m[source]
      if (!p) return m
      const fields = p.fields.includes(field) ? p.fields.filter((f) => f !== field) : [...p.fields, field]
      return { ...m, [source]: { ...p, fields } }
    })
  }

  const martKeyValid = /^[a-z0-9][a-z0-9-]{2,39}$/.test(martKey)
  const canCreate = name.trim() && martKeyValid && Object.keys(measures).length > 0 && cat?.isAdmin

  async function create() {
    setCreating(true)
    setError(null)
    try {
      const payload = {
        martKey, name, description,
        dimAttrs: dims,
        measures: Object.values(measures).map((m) => ({
          source: m.source, fields: m.fields, useTail: m.useTail, groupByCategory: m.groupByCategory,
        })),
        condition: condField && condValues.length ? { field: condField, values: condValues } : null,
      }
      const res = await fetch("/api/marts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? "สร้างไม่สำเร็จ")
      // first run for the latest mastertruck month, then open the mart
      await fetch("/api/mart-etl", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ martKey, from: "2026-05", to: "2026-05" }),
      })
      router.push(`/datapipeline/data/mart?mart=${martKey}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างไม่สำเร็จ")
      setCreating(false)
    }
  }

  const inputCls = `h-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 text-[13px] text-gray-700 dark:text-gray-200 outline-none focus:border-cyan-400`

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-950/50">
          <Layers size={18} className="text-cyan-600 dark:text-cyan-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">สร้าง Data Mart</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            grain = ทะเบียน × บริการ (snowflake) — เลือก data + master + condition
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[13px] text-red-600 dark:text-red-400">{error}</div>
      )}
      {!cat && !error && (
        <div className="flex items-center gap-2 p-6 text-[13px] text-gray-400"><Loader2 size={14} className="animate-spin" /> กำลังโหลด...</div>
      )}

      {cat && (
        <div className="space-y-5">
          {/* name */}
          <div className="grid gap-3 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">ชื่อ Mart</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น สรุปรถโม่" className={`${inputCls} w-full`} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">martKey (a-z, 0-9, -)</span>
              <input value={martKey} onChange={(e) => setMartKey(e.target.value.toLowerCase())} placeholder="mixer-summary" className={`${inputCls} w-full font-mono ${martKey && !martKeyValid ? "border-red-400" : ""}`} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[12px] font-medium text-gray-500 dark:text-gray-400">คำอธิบาย</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} w-full`} />
            </label>
          </div>

          {/* ① DATA (measures) */}
          <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-bold text-gray-800 dark:text-gray-200">
              <Database size={15} className="text-cyan-500" /> ① เลือก Data (รวมจากแหล่งไหนบ้าง)
            </div>
            <div className="space-y-2">
              {Object.entries(cat.measureSources).map(([source, def]) => {
                const picked = measures[source]
                return (
                  <div key={source} className={`rounded-lg border p-3 ${picked ? "border-cyan-300 bg-cyan-50/40 dark:bg-cyan-950/20" : "border-gray-200 dark:border-white/8"}`}>
                    <label className="flex items-center gap-2 text-[13px] font-medium text-gray-800 dark:text-gray-200">
                      <input type="checkbox" checked={!!picked} onChange={() => toggleSource(source, def)} className="h-4 w-4 accent-cyan-600" />
                      {def.label}
                    </label>
                    {picked && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                        {def.numeric.map((f) => (
                          <label key={f} className="flex items-center gap-1 rounded-md bg-white dark:bg-white/8 px-2 py-1 text-[12px] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10">
                            <input type="checkbox" checked={picked.fields.includes(f)} onChange={() => toggleField(source, f)} className="h-3.5 w-3.5 accent-cyan-600" />
                            {f}
                          </label>
                        ))}
                        {def.hasPlateTail && (
                          <label className="flex items-center gap-1 text-[12px] text-gray-500">
                            <input type="checkbox" checked={picked.useTail} onChange={() => setMeasures((m) => ({ ...m, [source]: { ...picked, useTail: !picked.useTail } }))} className="h-3.5 w-3.5 accent-cyan-600" />
                            นับคู่ (head+tail)
                          </label>
                        )}
                        {def.hasCategory && (
                          <label className="flex items-center gap-1 text-[12px] text-gray-500">
                            <input type="checkbox" checked={picked.groupByCategory} onChange={() => setMeasures((m) => ({ ...m, [source]: { ...picked, groupByCategory: !picked.groupByCategory } }))} className="h-3.5 w-3.5 accent-cyan-600" />
                            แยก {def.hasCategory}
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ② MASTER (dims) */}
          <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-bold text-gray-800 dark:text-gray-200">
              <Warehouse size={15} className="text-cyan-500" /> ② เลือก Master Data (คอลัมน์มิติ)
            </div>
            <div className="flex flex-wrap gap-2">
              {cat.masterDims.map((d) => (
                <button key={d} onClick={() => setDims((x) => x.includes(d) ? x.filter((v) => v !== d) : [...x, d])}
                  className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${dims.includes(d) ? "bg-cyan-100 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300" : "bg-gray-100 dark:bg-white/8 text-gray-500 dark:text-gray-500"}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* ③ CONDITION */}
          <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-bold text-gray-800 dark:text-gray-200">
              <SlidersHorizontal size={15} className="text-cyan-500" /> ③ Condition (กรองรถ — ไม่บังคับ)
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={condField} onChange={(e) => { setCondField(e.target.value); setCondValues([]) }} className={inputCls}>
                <option value="">ไม่กรอง</option>
                {cat.conditionFields.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              {condField && (cat.conditions[condField] ?? []).map((v) => (
                <button key={v} onClick={() => setCondValues((x) => x.includes(v) ? x.filter((y) => y !== v) : [...x, v])}
                  className={`rounded-md px-2 py-1 text-[12px] ${condValues.includes(v) ? "bg-cyan-100 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300" : "bg-gray-100 dark:bg-white/8 text-gray-500"}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* actions */}
          <div className="flex items-center justify-between">
            <button onClick={() => router.push("/datapipeline/data")} className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-3 text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/6">
              <ArrowLeft size={14} /> ยกเลิก
            </button>
            <button onClick={create} disabled={!canCreate || creating}
              title={cat.isAdmin ? undefined : "ต้องเป็น admin"}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-cyan-600 px-4 text-[13px] font-medium text-white disabled:opacity-40 hover:bg-cyan-700">
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              สร้าง + run เดือน 2026-05
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
