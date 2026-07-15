"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Database,
  Loader2,
  Plus,
  SlidersHorizontal,
  Warehouse,
  Workflow,
} from "lucide-react"

type MonthStat = { monthKey: string; rows: number }

type RunStat = {
  monthKey: string
  rulesVersion: number
  trips: number
  excluded: number
  triggeredBy: string
  finishedAt: string
  durationMs: number
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
  target: { collection: string; href: string; monthsLoaded: number; months: MonthStat[] }
}

function fmtDate(s: string | null): string {
  return s ? new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"
}

function PillarCard({
  step,
  title,
  subtitle,
  icon: Icon,
  tone,
  href,
  children,
}: {
  step: string
  title: string
  subtitle: string
  icon: React.ElementType
  tone: "sky" | "violet" | "amber"
  href: string
  children: React.ReactNode
}) {
  const tones = {
    sky: {
      bg: "bg-sky-100 dark:bg-sky-950/50",
      text: "text-sky-600 dark:text-sky-400",
      border: "hover:border-sky-300 dark:hover:border-sky-700",
    },
    violet: {
      bg: "bg-violet-100 dark:bg-violet-950/50",
      text: "text-violet-600 dark:text-violet-400",
      border: "hover:border-violet-300 dark:hover:border-violet-700",
    },
    amber: {
      bg: "bg-amber-100 dark:bg-amber-950/50",
      text: "text-amber-600 dark:text-amber-400",
      border: "hover:border-amber-300 dark:hover:border-amber-700",
    },
  }[tone]

  return (
    <Link
      href={href}
      className={`flex min-w-0 flex-1 flex-col rounded-xl border border-gray-200 dark:border-white/8
        bg-white dark:bg-white/3 p-4 transition-colors ${tones.border}`}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones.bg}`}>
          <Icon size={15} className={tones.text} />
        </div>
        <div className="min-w-0">
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${tones.text}`}>{step}</p>
          <p className="truncate text-[13px] font-bold text-gray-900 dark:text-white leading-tight">{title}</p>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate">{subtitle}</p>
      <div className="space-y-1 text-[12px]">{children}</div>
    </Link>
  )
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
      <span className="truncate text-right font-medium tabular-nums text-gray-700 dark:text-gray-300">{value}</span>
    </div>
  )
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<FlowOverview[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/etl/overview")
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error ?? "โหลดข้อมูลไม่สำเร็จ")
        setFlows(json.data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
  }, [])

  return (
    <div className="max-w-5xl">
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
            text-white hover:bg-sky-700 transition-colors"
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

      {(flows ?? []).map((flow) => (
        <div
          key={flow.flowKey}
          className="mb-6 rounded-2xl border border-gray-200 dark:border-white/8 bg-gray-50/60 dark:bg-white/2 p-4"
        >
          {/* Flow header */}
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">{flow.name}</h2>
            <p className="text-[12px] text-gray-400 dark:text-gray-500">{flow.description}</p>
          </div>

          {/* 3 pillars */}
          <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
            <PillarCard
              step="1 · Datasource"
              title={flow.source.collection}
              subtitle={`mena-bi.${flow.source.collection}`}
              icon={Database}
              tone="sky"
              href={flow.source.href}
            >
              <StatLine label="sync ล่าสุด" value={fmtDate(flow.source.lastSync)} />
              {flow.source.months.map((m) => (
                <StatLine key={m.monthKey} label={m.monthKey} value={`${m.rows.toLocaleString()} แถว`} />
              ))}
            </PillarCard>

            <ArrowRight size={18} className="mx-auto shrink-0 rotate-90 text-gray-300 dark:text-gray-600 lg:rotate-0" />

            <PillarCard
              step="2 · Condition & Process"
              title={`Rules v${flow.conditions.version}`}
              subtitle={`${flow.conditions.activeRules}/${flow.conditions.totalRules} rules เปิดใช้งาน`}
              icon={SlidersHorizontal}
              tone="violet"
              href={flow.conditions.href}
            >
              <StatLine label="แก้ไขล่าสุด" value={fmtDate(flow.conditions.updatedAt)} />
              <StatLine label="โดย" value={flow.conditions.updatedBy ?? "-"} />
              {flow.conditions.lastRuns[0] && (
                <StatLine
                  label={`run ล่าสุด (${flow.conditions.lastRuns[0].monthKey})`}
                  value={fmtDate(flow.conditions.lastRuns[0].finishedAt)}
                />
              )}
            </PillarCard>

            <ArrowRight size={18} className="mx-auto shrink-0 rotate-90 text-gray-300 dark:text-gray-600 lg:rotate-0" />

            <PillarCard
              step="3 · Data"
              title={flow.target.collection}
              subtitle={`mena-bi.${flow.target.collection}`}
              icon={Warehouse}
              tone="amber"
              href={flow.target.href}
            >
              <StatLine label="เดือนที่โหลดแล้ว" value={`${flow.target.monthsLoaded} เดือน`} />
              {flow.target.months.slice(0, 3).map((m) => (
                <StatLine key={m.monthKey} label={m.monthKey} value={`${m.rows.toLocaleString()} เที่ยว`} />
              ))}
            </PillarCard>
          </div>

          {/* Recent runs */}
          {flow.conditions.lastRuns.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3">
              <table className="w-full text-[12px] whitespace-nowrap">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-white/4">
                    {["เดือน", "rules", "เที่ยว", "ตัดออก", "โดย", "เมื่อ", "ใช้เวลา"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flow.conditions.lastRuns.map((run, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-white/5 last:border-0">
                      <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200">{run.monthKey}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">v{run.rulesVersion}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                        {run.trips.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-red-500 dark:text-red-400">
                        {run.excluded.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{run.triggeredBy}</td>
                      <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{fmtDate(run.finishedAt)}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-400 dark:text-gray-500">
                        {(run.durationMs / 1000).toFixed(1)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
