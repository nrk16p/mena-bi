"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { IBM_Plex_Mono, IBM_Plex_Sans_Thai } from "next/font/google"
import {
  ChevronDown,
  Database,
  History,
  Loader2,
  Plus,
  SlidersHorizontal,
  Warehouse,
  Workflow,
} from "lucide-react"

const plexThai = IBM_Plex_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"] })
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"] })

type MonthStat = { monthKey: string; rows: number; metric?: number | null }

type RunStat = {
  monthKey: string
  rulesVersion: number
  trips: number
  excluded: number
  excludedByRule?: Record<string, number>
  status?: string
  error?: string | null
  triggeredBy: string
  finishedAt: string
  durationMs: number
  /** flow-specific metrics, e.g. totalWeight */
  [key: string]: unknown
}

type FlowOverview = {
  flowKey: string
  name: string
  description: string
  source: { collection: string; href: string; lastSync: string | null; months: MonthStat[] }
  conditions: {
    href: string
    version: number
    totalRules: number
    activeRules: number
    updatedAt: string | null
    updatedBy: string | null
    lastRuns: RunStat[]
  }
  health: {
    status: "ok" | "error" | "none"
    lastRunAt: string | null
    lastRunMonth: string | null
    error: string | null
  }
  target: {
    collection: string
    href: string
    monthsLoaded: number
    months: MonthStat[]
    unit: string
    metric: { runField: string; label: string; unit: string } | null
  }
}

function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"
}

/* ---------- layout: source | fan-out | condition | edge | data ---------- */
const GRAPH_GRID = "lg:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)_3rem_minmax(0,1fr)]"

const TONES = {
  sky: {
    chip: "bg-gradient-to-br from-sky-100 to-sky-50 dark:from-sky-500/15 dark:to-sky-500/5",
    text: "text-sky-600 dark:text-sky-400",
    hover:
      "hover:border-sky-300 dark:hover:border-sky-600 hover:shadow-[0_10px_28px_rgba(14,165,233,0.18)]",
    port: "bg-sky-400 dark:bg-sky-500",
  },
  violet: {
    chip: "bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-500/15 dark:to-violet-500/5",
    text: "text-violet-600 dark:text-violet-400",
    hover:
      "hover:border-violet-300 dark:hover:border-violet-600 hover:shadow-[0_10px_28px_rgba(139,92,246,0.18)]",
    port: "bg-violet-400 dark:bg-violet-500",
  },
  amber: {
    chip: "bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-500/15 dark:to-amber-500/5",
    text: "text-amber-600 dark:text-amber-400",
    hover:
      "hover:border-amber-300 dark:hover:border-amber-600 hover:shadow-[0_10px_28px_rgba(217,119,6,0.16)]",
    port: "bg-amber-400 dark:bg-amber-500",
  },
} as const

type Tone = keyof typeof TONES

function LaneLabel({ n, label, tone }: { n: string; label: string; tone: Tone }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10.5px] font-bold
          ${TONES[tone].chip} ${TONES[tone].text}`}
      >
        {n}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-[0.09em] text-gray-400 dark:text-gray-500">
        {label}
      </span>
    </div>
  )
}

function GraphNode({
  step,
  title,
  subtitle,
  icon: Icon,
  tone,
  href,
  hasInput,
  hasOutput,
  glowOutput,
  badge,
  children,
}: {
  step: string
  title: string
  subtitle: string
  icon: React.ElementType
  tone: Tone
  href: string
  hasInput?: boolean
  hasOutput?: boolean
  glowOutput?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  const t = TONES[tone]
  return (
    <Link
      href={href}
      className={`group relative flex w-full min-w-0 flex-col justify-center rounded-2xl border
        border-gray-200 dark:border-white/9 bg-white dark:bg-white/3 p-4
        shadow-[0_1px_4px_rgba(15,23,42,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]
        transition-all duration-250 ease-out hover:-translate-y-0.5 ${t.hover}`}
    >
      {/* connection ports (desktop) */}
      {hasInput && (
        <span
          className={`absolute -left-[5px] top-1/2 hidden h-[9px] w-[9px] -translate-y-1/2 rounded-full
            ring-2 ring-white dark:ring-gray-950 lg:block ${t.port}`}
        />
      )}
      {hasOutput && (
        <span
          className={`absolute -right-[5px] top-1/2 hidden h-[9px] w-[9px] -translate-y-1/2 rounded-full
            ring-2 ring-white dark:ring-gray-950 lg:block ${t.port}`}
          style={glowOutput ? { animation: "portGlow 2.4s ease-in-out infinite" } : undefined}
        />
      )}

      <div className="mb-3 flex items-center gap-2.5">
        <div className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${t.chip}`}>
          <Icon size={16} className={t.text} />
        </div>
        <div className="min-w-0">
          <p className={`text-[9px] font-semibold uppercase tracking-wide lg:hidden ${t.text}`}>{step}</p>
          <p className="flex items-center gap-1.5 truncate text-[14px] font-bold leading-tight text-gray-900 dark:text-white">
            <span className="truncate">{title}</span>
            {badge}
          </p>
          <p className={`truncate text-[10px] text-gray-400 dark:text-gray-500 ${plexMono.className}`}>{subtitle}</p>
        </div>
      </div>
      <div className="space-y-[5px] text-[11.5px]">{children}</div>
    </Link>
  )
}

/* ---------- animated edges (pixel-space paths so dots stay round) ---------- */

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ...size }
}

function EdgeSvg({ w, h, paths, dot }: { w: number; h: number; paths: { d: string; dur: number; delay: number }[]; dot: string }) {
  if (!w || !h) return null
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="block overflow-visible text-gray-300 dark:text-white/18"
    >
      {paths.map((p, i) => (
        <g key={i}>
          <path
            d={p.d}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeDasharray="5 4"
            style={{ animation: "edgeDash 0.9s linear infinite" }}
          />
          <circle
            r="2.6"
            fill={dot}
            style={{
              offsetPath: `path('${p.d}')`,
              animation: `edgeDot ${p.dur}s ${p.delay}s ease-in-out infinite`,
              opacity: 0,
            }}
          />
        </g>
      ))}
    </svg>
  )
}

/** Fan-out curves from one source node to N condition nodes (desktop only) */
function FanOut({ count }: { count: number }) {
  const { ref, w, h } = useSize<HTMLDivElement>()
  const paths = Array.from({ length: count }).map((_, i) => {
    const y = ((i + 0.5) / count) * h
    return {
      d: `M 0 ${h / 2} C ${w * 0.55} ${h / 2}, ${w * 0.45} ${y}, ${w} ${y}`,
      dur: 2.4,
      delay: i * 0.55,
    }
  })
  return (
    <div ref={ref} className="h-full w-full">
      <EdgeSvg w={w} h={h} paths={paths} dot="#38bdf8" />
    </div>
  )
}

/** Straight dashed edge — horizontal on desktop, vertical on mobile */
function Edge() {
  const { ref, w, h } = useSize<HTMLDivElement>()
  return (
    <div className="flex h-full items-center justify-center">
      {/* mobile: short vertical dash */}
      <div className="my-0.5 h-4 border-l border-dashed border-gray-300 dark:border-white/15 lg:hidden" />
      {/* desktop: animated dashed line with travelling dot */}
      <div ref={ref} className="hidden h-full w-full lg:block">
        <EdgeSvg w={w} h={h} paths={[{ d: `M 0 ${h / 2} L ${w} ${h / 2}`, dur: 2, delay: 0 }]} dot="#a78bfa" />
      </div>
    </div>
  )
}

function HealthDot({ health }: { health: FlowOverview["health"] }) {
  if (health.status === "none") return null
  const ok = health.status === "ok"
  return (
    <span
      title={
        ok
          ? `run ล่าสุดสำเร็จ (${health.lastRunMonth ?? ""}) ${fmtDate(health.lastRunAt)}`
          : `run ล่าสุดล้มเหลว (${health.lastRunMonth ?? ""}): ${health.error ?? ""}`
      }
      className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
      style={{
        animation: ok ? "pulseOk 2.6s ease-in-out infinite" : "pulseErr 1.6s ease-in-out infinite",
      }}
    />
  )
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-gray-400 dark:text-gray-500">{label}</span>
      <span className="truncate text-right font-medium tabular-nums text-gray-700 dark:text-gray-300">{value}</span>
    </div>
  )
}

/* ---------- log history modal ---------- */

function StatusChip({ failed }: { failed: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold
        ${failed
          ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"
          : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${failed ? "bg-red-500" : "bg-emerald-500"}`} />
      {failed ? "ล้มเหลว" : "สำเร็จ"}
    </span>
  )
}

function RunsLogTable({
  runs,
  unit,
  metric,
}: {
  runs: RunStat[]
  unit: string
  metric: FlowOverview["target"]["metric"]
}) {
  const [openRow, setOpenRow] = useState<number | null>(null)
  const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString() : "—")
  const colCount = 8 + (metric ? 1 : 0)
  return (
    <table className="w-full whitespace-nowrap text-[12px]">
      <thead>
        <tr>
          {["เดือน", "สถานะ", "rules", unit, ...(metric ? [metric.label] : []), "ตัดออก", "โดย", "เมื่อ", "ใช้เวลา"].map(
            (h) => (
              <th
                key={h}
                className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left
                  font-semibold text-gray-500 dark:border-white/8 dark:bg-[#141d30] dark:text-gray-400"
              >
                {h}
              </th>
            )
          )}
        </tr>
      </thead>
      <tbody>
        {runs.map((run, i) => {
          const failed = run.status === "error"
          const byRule = Object.entries(run.excludedByRule ?? {})
          const expandable = byRule.length > 0
          const isOpen = openRow === i
          return (
            <Fragment key={i}>
              <tr
                onClick={expandable ? () => setOpenRow(isOpen ? null : i) : undefined}
                className={`border-b border-gray-100 transition-colors last:border-0 dark:border-white/5
                  ${expandable ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/4" : ""}`}
              >
                <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{run.monthKey}</td>
                <td className="px-3 py-2">
                  <StatusChip failed={failed} />
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                  {run.rulesVersion ? `v${run.rulesVersion}` : "—"}
                </td>
                {failed ? (
                  <td
                    className="max-w-[280px] truncate px-3 py-2 text-red-500 dark:text-red-400"
                    colSpan={metric ? 3 : 2}
                    title={String(run.error ?? "")}
                  >
                    {String(run.error ?? "error")}
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{num(run.trips)}</td>
                    {metric && (
                      <td className="px-3 py-2 font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                        {num(run[metric.runField])}
                      </td>
                    )}
                    <td className="px-3 py-2 tabular-nums text-red-500 dark:text-red-400">
                      {num(run.excluded)}
                      {expandable && (
                        <span className="ml-1 text-[10px] text-gray-400">{isOpen ? "▾" : "▸"}</span>
                      )}
                    </td>
                  </>
                )}
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{run.triggeredBy}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{fmtDate(run.finishedAt)}</td>
                <td className="px-3 py-2 tabular-nums text-gray-400 dark:text-gray-500">
                  {typeof run.durationMs === "number" ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}
                </td>
              </tr>
              {isOpen && (
                <tr className="border-b border-gray-100 dark:border-white/5">
                  <td colSpan={colCount} className="bg-gray-50/70 px-4 py-2.5 dark:bg-white/3">
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                      ตัดออกตามเงื่อนไข
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {byRule.map(([label, count]) => (
                        <span
                          key={label}
                          className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] text-red-600
                            dark:bg-red-950/40 dark:text-red-300"
                        >
                          {label} · {Number(count).toLocaleString()}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function ConditionNode({ flow }: { flow: FlowOverview }) {
  const lastRun = flow.conditions.lastRuns[0]
  return (
    <GraphNode
      step="2 · Condition & Process"
      title={`เงื่อนไข · ${flow.name}`}
      subtitle={`Rules v${flow.conditions.version} · ${flow.conditions.activeRules}/${flow.conditions.totalRules} เปิดใช้งาน`}
      icon={SlidersHorizontal}
      tone="violet"
      href={flow.conditions.href}
      hasInput
      hasOutput
      badge={<HealthDot health={flow.health} />}
    >
      <StatLine label="แก้ไขล่าสุด" value={fmtDate(flow.conditions.updatedAt)} />
      {lastRun && <StatLine label={`run ล่าสุด (${lastRun.monthKey})`} value={fmtDate(lastRun.finishedAt)} />}
    </GraphNode>
  )
}

function DataNode({ flow }: { flow: FlowOverview }) {
  const m = flow.target.months[0]
  const metric = flow.target.metric
  const monthValue = m
    ? metric && m.metric != null
      ? `${m.metric.toLocaleString()} ${metric.unit}`.trim()
      : `${m.rows.toLocaleString()} ${flow.target.unit}`
    : null
  return (
    <GraphNode
      step="3 · Data"
      title={flow.target.collection}
      subtitle={`mena-bi.${flow.target.collection}`}
      icon={Warehouse}
      tone="amber"
      href={flow.target.href}
      hasInput
    >
      <StatLine
        label={metric ? `เดือนที่โหลด · ${metric.label}` : "เดือนที่โหลดแล้ว"}
        value={`${flow.target.monthsLoaded} เดือน`}
      />
      {m && monthValue && (
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-gray-400 dark:text-gray-500">{m.monthKey}</span>
          <span className="truncate text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {monthValue}
          </span>
        </div>
      )}
    </GraphNode>
  )
}

function SourceNode({ group }: { group: FlowOverview[] }) {
  const src = group[0].source
  const latestMonth = src.months[0]
  return (
    <GraphNode
      step="1 · Datasource"
      title={src.collection}
      subtitle={`mena-bi.${src.collection}`}
      icon={Database}
      tone="sky"
      href={src.href}
      hasOutput
      glowOutput
    >
      <StatLine label="sync ล่าสุด" value={fmtDate(src.lastSync)} />
      {latestMonth && (
        <StatLine label={latestMonth.monthKey} value={`${latestMonth.rows.toLocaleString()} แถว`} />
      )}
      {group.length > 1 && (
        <div className="flex items-center justify-between gap-2">
          <span className="shrink-0 text-gray-400 dark:text-gray-500">เชื่อมต่อ</span>
          <span className="font-semibold text-sky-500 dark:text-sky-400">{group.length} flows</span>
        </div>
      )}
    </GraphNode>
  )
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<FlowOverview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch("/api/etl/overview")
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
        setFlows(json.data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
  }, [])

  // one graph per datasource: single source node fanning out to each flow's rules → data
  const groups: FlowOverview[][] = []
  {
    const byId = new Map<string, FlowOverview[]>()
    for (const f of flows ?? []) {
      const list = byId.get(f.source.collection) ?? []
      list.push(f)
      if (list.length === 1) byId.set(f.source.collection, list)
    }
    groups.push(...byId.values())
  }

  return (
    <div className={`w-full ${plexThai.className}`}>
      <style>{`
        @keyframes edgeDash { to { stroke-dashoffset: -9; } }
        @keyframes edgeDot {
          0%   { offset-distance: 0%;   opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        @keyframes nodeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulseOk {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.45); }
          60%      { box-shadow: 0 0 0 5px rgba(16,185,129,0); }
        }
        @keyframes pulseErr {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          60%      { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
        @keyframes portGlow {
          0%, 100% { transform: translateY(-50%) scale(1); }
          50%      { transform: translateY(-50%) scale(1.35); }
        }
        .flow-dotgrid {
          background-image: radial-gradient(rgba(15,23,42,0.055) 1px, transparent 1px);
          background-size: 22px 22px;
        }
        .dark .flow-dotgrid {
          background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
        }
      `}</style>

      {/* Header */}
      <div className="mb-6 flex items-center gap-3.5">
        <div
          className="flex h-[42px] w-[42px] items-center justify-center rounded-[13px]
            bg-gradient-to-br from-sky-500 to-indigo-500 shadow-[0_4px_14px_rgba(14,165,233,0.35)]"
        >
          <Workflow size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[19px] font-bold text-gray-900 dark:text-white">Flows</h1>
          <p className="text-[12.5px] text-gray-400 dark:text-gray-500">
            ภาพรวมทุก flow: Datasource → Condition &amp; Process → Data
          </p>
        </div>
        <Link
          href="/datapipeline/flows/new"
          className="ml-auto flex h-9 items-center gap-1.5 rounded-[10px] bg-gradient-to-br from-sky-500 to-sky-600
            px-4 text-[13px] font-semibold text-white shadow-[0_3px_10px_rgba(2,132,199,0.35)]
            transition-all hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(2,132,199,0.45)]"
        >
          <Plus size={14} strokeWidth={2.5} /> สร้าง Flow
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30
          px-3 py-2 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {!flows && !error && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-white/8
          bg-white dark:bg-white/3 p-10 text-[13px] text-gray-400">
          <Loader2 size={15} className="animate-spin" /> กำลังโหลด...
        </div>
      )}

      {/* Lane headers (desktop) */}
      {flows && flows.length > 0 && (
        <div className={`mb-2.5 hidden gap-0 px-[18px] lg:grid ${GRAPH_GRID}`}>
          <LaneLabel n="1" label="Datasource" tone="sky" />
          <span />
          <LaneLabel n="2" label="Condition & Process" tone="violet" />
          <span />
          <LaneLabel n="3" label="Data" tone="amber" />
        </div>
      )}

      {groups.map((group, gi) => {
        const n = group.length
        return (
          <div
            key={group[0].source.collection}
            className="relative mb-4 overflow-hidden rounded-[20px] border border-gray-200 dark:border-white/9
              bg-white/55 dark:bg-white/[0.025] p-[18px]"
            style={{ animation: `nodeIn 0.5s ease ${gi * 0.08}s both` }}
          >
            <div aria-hidden className="flow-dotgrid pointer-events-none absolute inset-0" />

            {/* Desktop: one source node fans out to N condition → data rows */}
            <div className={`relative hidden auto-rows-fr lg:grid ${GRAPH_GRID}`}>
              <div className="flex items-center py-[7px]" style={{ gridRow: `span ${n}` }}>
                <SourceNode group={group} />
              </div>
              <div style={{ gridRow: `span ${n}` }}>
                <FanOut count={n} />
              </div>
              {group.map((flow) => (
                <div key={flow.flowKey} className="col-span-3 grid grid-cols-subgrid">
                  <div className="py-[7px]">
                    <ConditionNode flow={flow} />
                  </div>
                  <Edge />
                  <div className="py-[7px]">
                    <DataNode flow={flow} />
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile: stacked */}
            <div className="relative flex flex-col lg:hidden">
              <SourceNode group={group} />
              {group.map((flow) => (
                <div key={flow.flowKey} className="flex flex-col">
                  <Edge />
                  <ConditionNode flow={flow} />
                  <Edge />
                  <DataNode flow={flow} />
                </div>
              ))}
            </div>

            {/* Run history (collapsible, per flow) */}
            <div className="relative mt-3 space-y-2">
              {group.map((flow) => {
                const runCount = flow.conditions.lastRuns.length
                if (runCount === 0) return null
                const isOpen = !!expanded[flow.flowKey]
                return (
                  <div key={flow.flowKey}>
                    <button
                      onClick={() => setExpanded((s) => ({ ...s, [flow.flowKey]: !s[flow.flowKey] }))}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-medium
                        text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700
                        dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                    >
                      <History size={13} />
                      ประวัติ log · {flow.name} ({runCount})
                      <ChevronDown size={13} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200 bg-white
                        dark:border-white/8 dark:bg-white/3">
                        <RunsLogTable
                          runs={flow.conditions.lastRuns}
                          unit={flow.target.unit}
                          metric={flow.target.metric}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
