"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { KeyRound, Sigma, Share2, Table2 } from "lucide-react"
import { MODELS } from "@/lib/model/registry"

// Fixed canvas positions (px) — a free layout like Power BI's model view.
const LAYOUT: Record<string, { x: number; y: number }> = {
  dim_fleet: { x: 30, y: 70 },
  dim_truck: { x: 330, y: 70 },
  dim_service: { x: 690, y: 70 },
  martData: { x: 330, y: 330 },
  dim_month: { x: 690, y: 330 },
}
const CARD_W = 224
const CANVAS_W = 960
const CANVAS_H = 660

type Pt = { x: number; y: number }
type Edge = { d: string; from: Pt; to: Pt }

export default function ModelViewPage() {
  const model = MODELS["truck-summary"]
  const canvasRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [edges, setEdges] = useState<Edge[]>([])

  useLayoutEffect(() => {
    function draw() {
      const canvas = canvasRef.current
      if (!canvas) return
      const cb = canvas.getBoundingClientRect()
      const next: Edge[] = []
      for (const rel of model.relationships) {
        const fromCard = cardRefs.current[rel.from.table]
        const toCard = cardRefs.current[rel.to.table]
        const fromRow = rowRefs.current[`${rel.from.table}.${rel.from.column}`]
        const toRow = rowRefs.current[`${rel.to.table}.${rel.to.column}`]
        if (!fromCard || !toCard || !fromRow || !toRow) continue
        const fc = fromCard.getBoundingClientRect()
        const tc = toCard.getBoundingClientRect()
        const fr = fromRow.getBoundingClientRect()
        const tr = toRow.getBoundingClientRect()
        const fCx = fc.left + fc.width / 2 - cb.left
        const fCy = fc.top + fc.height / 2 - cb.top
        const tCx = tc.left + tc.width / 2 - cb.left
        const tCy = tc.top + tc.height / 2 - cb.top
        const dx = tCx - fCx
        const dy = tCy - fCy

        let from: Pt, to: Pt, c1: Pt, c2: Pt
        if (Math.abs(dx) >= Math.abs(dy)) {
          const fx = dx >= 0 ? fc.right - cb.left : fc.left - cb.left
          const tx = dx >= 0 ? tc.left - cb.left : tc.right - cb.left
          from = { x: fx, y: fr.top + fr.height / 2 - cb.top }
          to = { x: tx, y: tr.top + tr.height / 2 - cb.top }
          const mx = (from.x + to.x) / 2
          c1 = { x: mx, y: from.y }
          c2 = { x: mx, y: to.y }
        } else {
          const fy = dy >= 0 ? fc.bottom - cb.top : fc.top - cb.top
          const ty = dy >= 0 ? tc.top - cb.top : tc.bottom - cb.top
          from = { x: fCx, y: fy }
          to = { x: tCx, y: ty }
          const my = (from.y + to.y) / 2
          c1 = { x: from.x, y: my }
          c2 = { x: to.x, y: my }
        }
        next.push({ d: `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`, from, to })
      }
      setEdges(next)
    }
    draw()
    const t = setTimeout(draw, 60) // after fonts settle
    window.addEventListener("resize", draw)
    return () => {
      clearTimeout(t)
      window.removeEventListener("resize", draw)
    }
  }, [model])

  return (
    <div className="max-w-full">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 dark:bg-cyan-950/50">
          <Share2 size={18} className="text-cyan-600 dark:text-cyan-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Model View</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">{model.description}</p>
        </div>
      </div>

      {/* legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1"><KeyRound size={12} className="text-amber-500" /> key</span>
        <span className="flex items-center gap-1"><Sigma size={12} className="text-cyan-500" /> measure</span>
        <span className="flex items-center gap-1"><span className="font-mono text-gray-400">∗ → 1</span> many-to-one</span>
        <span className="ml-auto text-gray-400 dark:text-gray-500">เส้น = relationship (join)</span>
      </div>

      {/* canvas */}
      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-[#f4f6f8] dark:bg-[#0e1116] overflow-auto"
        style={{ backgroundImage: "radial-gradient(currentColor 0.5px, transparent 0.5px)", backgroundSize: "18px 18px", color: "rgba(120,130,145,.18)" }}>
        <div ref={canvasRef} className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
          {/* relationship lines */}
          <svg className="pointer-events-none absolute inset-0" width={CANVAS_W} height={CANVAS_H}>
            {edges.map((e, i) => (
              <g key={i}>
                <path d={e.d} fill="none" stroke="#06b6d4" strokeWidth={1.6} opacity={0.8} />
                {/* many marker (∗) */}
                <circle cx={e.from.x} cy={e.from.y} r={7} fill="#fff" stroke="#06b6d4" strokeWidth={1.2} className="dark:fill-[#0e1116]" />
                <text x={e.from.x} y={e.from.y + 3.5} textAnchor="middle" fontSize={11} fill="#0891b2" fontWeight="700">∗</text>
                {/* one marker (1) */}
                <circle cx={e.to.x} cy={e.to.y} r={7} fill="#fff" stroke="#06b6d4" strokeWidth={1.2} className="dark:fill-[#0e1116]" />
                <text x={e.to.x} y={e.to.y + 3.5} textAnchor="middle" fontSize={10} fill="#0891b2" fontWeight="700">1</text>
              </g>
            ))}
          </svg>

          {/* table cards */}
          {model.tables.map((t) => {
            const pos = LAYOUT[t.name] ?? { x: 20, y: 20 }
            const isFact = t.kind === "fact"
            return (
              <div
                key={t.name}
                ref={(el) => { cardRefs.current[t.name] = el }}
                className={`absolute rounded-lg border shadow-sm ${
                  isFact
                    ? "border-cyan-300 dark:border-cyan-700 ring-1 ring-cyan-200 dark:ring-cyan-900"
                    : "border-gray-300 dark:border-white/12"
                } bg-white dark:bg-[#161b22]`}
                style={{ left: pos.x, top: pos.y, width: CARD_W }}
              >
                <div className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 ${
                  isFact ? "bg-cyan-500 text-white" : "bg-gray-100 dark:bg-white/6 text-gray-700 dark:text-gray-200"
                }`}>
                  <Table2 size={13} />
                  <span className="text-[12.5px] font-bold">{t.title}</span>
                  <span className={`ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                    isFact ? "bg-white/25" : "bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400"
                  }`}>{t.kind}</span>
                </div>
                <div className="py-1">
                  {t.columns.map((c) => (
                    <div
                      key={c.name}
                      ref={(el) => { rowRefs.current[`${t.name}.${c.name}`] = el }}
                      className="flex items-center gap-1.5 px-3 py-[3px] text-[11.5px]"
                    >
                      {c.role === "key" ? (
                        <KeyRound size={11} className="shrink-0 text-amber-500" />
                      ) : c.role === "measure" ? (
                        <Sigma size={11} className="shrink-0 text-cyan-500" />
                      ) : (
                        <span className="ml-[11px]" />
                      )}
                      <span className={`truncate ${c.role === "key" ? "font-semibold text-gray-800 dark:text-gray-100" : c.role === "measure" ? "text-cyan-700 dark:text-cyan-300" : "text-gray-500 dark:text-gray-400"}`}>
                        {c.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-3 text-[12px] text-gray-400 dark:text-gray-500">
        โมเดลนี้คือ schema เบื้องหลัง Dashboard/Pivot — <b>fact</b> (สรุปรายรถ) เชื่อมเข้า dimension แบบ snowflake
        (<code className="rounded bg-gray-100 dark:bg-white/8 px-1">dim_truck → dim_fleet</code>).
        <b> measure engine</b> ทำงานจากโมเดลนี้แล้ว — Dashboard และ Pivot คำนวณ measure (รวมสัดส่วน เช่น บาท/เที่ยว)
        และมิติ ผ่าน <code className="rounded bg-gray-100 dark:bg-white/8 px-1">/api/model/query</code> จากนิยามเดียวกัน.
      </p>
    </div>
  )
}
