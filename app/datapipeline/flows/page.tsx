"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
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

type MonthStat = { monthKey: string; rows: number; metric?: number | null }

type RunStat = {
  monthKey: string
  rulesVersion: number
  trips: number
  excluded: number
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
const GRAPH_GRID = "lg:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)_2.75rem_minmax(0,1fr)]"

const TONES = {
  sky: {
    bg: "bg-sky-100 dark:bg-sky-950/50",
    text: "text-sky-600 dark:text-sky-400",
    border: "hover:border-sky-300 dark:hover:border-sky-700",
    port: "bg-sky-400 dark:bg-sky-500",
  },
  violet: {
    bg: "bg-violet-100 dark:bg-violet-950/50",
    text: "text-violet-600 dark:text-violet-400",
    border: "hover:border-violet-300 dark:hover:border-violet-700",
    port: "bg-violet-400 dark:bg-violet-500",
  },
  amber: {
    bg: "bg-amber-100 dark:bg-amber-950/50",
    text: "text-amber-600 dark:text-amber-400",
    border: "hover:border-amber-300 dark:hover:border-amber-700",
    port: "bg-amber-400 dark:bg-amber-500",
  },
} as const

type Tone = keyof typeof TONES

function LaneLabel({ n, label, tone }: { n: string; label: string; tone: Tone }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] font-bold
          ${TONES[tone].bg} ${TONES[tone].text}`}
      >
        {n}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
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
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  const t = TONES[tone]
  return (
    <Link
      href={href}
      className={`group relative flex h-full w-full min-w-0 flex-col justify-center rounded-xl border
        border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-3.5 transition-all
        hover:shadow-sm ${t.border}`}
    >
      {/* connection ports (desktop) */}
      {hasInput && (
        <span
          className={`absolute -left-1 top-1/2 hidden h-2 w-2 -translate-y-1/2 rounded-full
            ring-2 ring-white dark:ring-gray-950 lg:block ${t.port}`}
        />
      )}
      {hasOutput && (
        <span
          className={`absolute -right-1 top-1/2 hidden h-2 w-2 -translate-y-1/2 rounded-full
            ring-2 ring-white dark:ring-gray-950 lg:block ${t.port}`}
        />
      )}

      <div className="mb-2.5 flex items-center gap-2.5">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.bg}`}>
          <Icon size={14} className={t.text} />
        </div>
        <div className="min-w-0">
          <p className={`text-[9px] font-semibold uppercase tracking-wide lg:hidden ${t.text}`}>{step}</p>
          <p className="flex items-center gap-1.5 truncate text-[13px] font-bold leading-tight text-gray-900 dark:text-white">
            <span className="truncate">{title}</span>
            {badge}
          </p>
          <p className="truncate font-mono text-[10px] text-gray-400 dark:text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-1 text-[11.5px]">{children}</div>
    </Link>
  )
}

/** Straight dashed edge — horizontal on desktop, vertical on mobile */
function Edge() {
  return (
    <div className="flex h-full items-center justify-center">
      {/* mobile: short vertical dash */}
      <div className="my-0.5 h-4 border-l border-dashed border-gray-300 dark:border-white/15 lg:hidden" />
      {/* desktop: horizontal line with travelling dot */}
      <div className="relative hidden h-px w-full border-t border-dashed border-gray-300 dark:border-white/15 lg:block">
        <span className="flow-edge-dot" />
      </div>
    </div>
  )
}

/** Fan-out curves from one source node to N condition nodes (desktop only) */
function FanOut({ count }: { count: number }) {
  return (
    <svg
      className="h-full w-full text-gray-300 dark:text-white/15"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {Array.from({ length: count }).map((_, i) => {
        const y = ((i + 0.5) / count) * 100
        return (
          <path
            key={i}
            d={`M 0 50 C 55 50, 45 ${y}, 100 ${y}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
        )
      })}
    </svg>
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

function RunsTable({ flow }: { flow: FlowOverview }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3">
      <table className="w-full whitespace-nowrap text-[12px]">
        <thead>
          <tr className="border-b border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-white/4">
            {[
              "เดือน",
              "rules",
              flow.target.unit,
              ...(flow.target.metric ? [flow.target.metric.label] : []),
              "ตัดออก",
              "โดย",
              "เมื่อ",
              "ใช้เวลา",
            ].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {flow.conditions.lastRuns.map((run, i) => {
            const failed = run.status === "error"
            const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString() : "—")
            return (
              <tr key={i} className="border-b border-gray-100 dark:border-white/5 last:border-0">
                <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">
                  {run.monthKey}
                  {failed && (
                    <span
                      className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300"
                      title={String(run.error ?? "")}
                    >
                      ล้มเหลว
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                  {run.rulesVersion ? `v${run.rulesVersion}` : "—"}
                </td>
                {failed ? (
                  <td className="px-3 py-2 text-red-500 dark:text-red-400" colSpan={flow.target.metric ? 3 : 2}>
                    {String(run.error ?? "error")}
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{num(run.trips)}</td>
                    {flow.target.metric && (
                      <td className="px-3 py-2 font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                        {num(run[flow.target.metric.runField])}
                      </td>
                    )}
                    <td className="px-3 py-2 tabular-nums text-red-500 dark:text-red-400">{num(run.excluded)}</td>
                  </>
                )}
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{run.triggeredBy}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{fmtDate(run.finishedAt)}</td>
                <td className="px-3 py-2 tabular-nums text-gray-400 dark:text-gray-500">
                  {typeof run.durationMs === "number" ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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
      {m && monthValue && <StatLine label={m.monthKey} value={monthValue} />}
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
    >
      <StatLine label="sync ล่าสุด" value={fmtDate(src.lastSync)} />
      {latestMonth && (
        <StatLine label={latestMonth.monthKey} value={`${latestMonth.rows.toLocaleString()} แถว`} />
      )}
      {group.length > 1 && <StatLine label="เชื่อมต่อ" value={`${group.length} flows`} />}
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
    <div className="w-full">
      <style>{`
        @keyframes flowEdge {
          0%   { left: 0;                opacity: 0; }
          15%  {                         opacity: 1; }
          85%  {                         opacity: 1; }
          100% { left: calc(100% - 5px); opacity: 0; }
        }
        .flow-edge-dot {
          position: absolute;
          top: -3px;
          width: 5px;
          height: 5px;
          border-radius: 9999px;
          background: #38bdf8;
          animation: flowEdge 2.8s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/50">
          <Workflow size={18} className="text-sky-600 dark:text-sky-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Flows</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            ภาพรวมทุก flow: Datasource → Condition &amp; Process → Data
          </p>
        </div>
        <Link
          href="/datapipeline/flows/new"
          className="ml-auto flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 text-[13px] font-medium
            text-white transition-colors hover:bg-sky-700"
        >
          <Plus size={14} /> สร้าง Flow
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
        <div className={`mb-2 hidden gap-0 px-4 lg:grid ${GRAPH_GRID}`}>
          <LaneLabel n="1" label="Datasource" tone="sky" />
          <span />
          <LaneLabel n="2" label="Condition & Process" tone="violet" />
          <span />
          <LaneLabel n="3" label="Data" tone="amber" />
        </div>
      )}

      {groups.map((group) => {
        const n = group.length
        return (
          <div
            key={group[0].source.collection}
            className="mb-4 rounded-2xl border border-gray-200 dark:border-white/8 bg-gray-50/60 dark:bg-white/2 p-4"
          >
            {/* Desktop: one source node fans out to N condition → data rows */}
            <div className={`hidden auto-rows-fr lg:grid ${GRAPH_GRID}`}>
              <div className="flex items-center py-1.5" style={{ gridRow: `span ${n}` }}>
                <SourceNode group={group} />
              </div>
              <div style={{ gridRow: `span ${n}` }}>
                <FanOut count={n} />
              </div>
              {group.map((flow) => (
                <div key={flow.flowKey} className="col-span-3 grid grid-cols-subgrid">
                  <div className="py-1.5">
                    <ConditionNode flow={flow} />
                  </div>
                  <Edge />
                  <div className="py-1.5">
                    <DataNode flow={flow} />
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile: stacked */}
            <div className="flex flex-col lg:hidden">
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
            <div className="mt-3 space-y-2">
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
                      ประวัติ run · {flow.name} ({runCount})
                      <ChevronDown size={13} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="mt-2">
                        <RunsTable flow={flow} />
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
