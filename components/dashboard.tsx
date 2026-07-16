"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowRight, Banknote, Gauge, Loader2, Route, Scale, Truck } from "lucide-react"

type Summary = {
  month: string | null
  months: string[]
  trucks: number
  performance: { เที่ยว: number; น้ำหนัก: number }
  revenue: { ค่าขนส่ง: number; ค่าโอนย้าย: number; "ประกันรายได้ + ค่าอื่นๆ": number; รวม: number }
  byFleet: Array<{ fleet: string; revenue: number }>
  trend: Array<{ monthKey: string; revenue: number; trips: number }>
}

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
const qty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
const FLEET_COLORS = ["#0891b2", "#7c3aed", "#d97706", "#059669", "#dc2626", "#2563eb", "#db2777", "#65a30d"]

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ElementType
  accent: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${accent}`}>
          <Icon size={14} />
        </span>
        <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  )
}

export function Dashboard() {
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/dashboard-summary")
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? "โหลด dashboard ไม่สำเร็จ")
        setData(j.data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลด dashboard ไม่สำเร็จ"))
  }, [])

  if (error) {
    return <div className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[13px] text-red-600 dark:text-red-400">{error}</div>
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-10 text-[13px] text-gray-400">
        <Loader2 size={15} className="animate-spin" /> กำลังโหลด dashboard...
      </div>
    )
  }
  if (!data.month) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 dark:border-white/12 p-10 text-center text-[13px] text-gray-500 dark:text-gray-400">
        ยังไม่มีข้อมูล Data Mart — สร้าง/คำนวณ mart สรุปรายรถ ก่อน
        <Link href="/datapipeline/data/mart?mart=truck-summary" className="ml-2 text-cyan-600 dark:text-cyan-400 hover:underline">ไปที่ Data Mart →</Link>
      </div>
    )
  }

  const chart = data.byFleet.slice(0, 8).map((f) => ({
    name: f.fleet.length > 12 ? f.fleet.slice(0, 11) + "…" : f.fleet,
    revenue: f.revenue,
  }))

  return (
    <div className="space-y-4">
      {/* section header */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950/50">
          <Gauge size={16} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">Dashboard</h2>
        <span className="rounded-md bg-gray-100 dark:bg-white/8 px-2 py-0.5 text-[12px] font-medium text-gray-500 dark:text-gray-400">
          {data.month}
        </span>
        <Link href="/datapipeline/data/pivot"
          className="ml-auto flex items-center gap-1 text-[13px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
          Pivot Dashboard <ArrowRight size={14} />
        </Link>
      </div>

      {/* Performance */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">Performance</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi label="จำนวนเที่ยว" value={qty(data.performance["เที่ยว"])} icon={Route} accent="bg-cyan-100 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400" />
          <Kpi label="น้ำหนักรวม" value={qty(data.performance["น้ำหนัก"])} icon={Scale} accent="bg-cyan-100 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400" />
          <Kpi label="จำนวนรถ" value={qty(data.trucks)} icon={Truck} accent="bg-cyan-100 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400" />
        </div>
      </div>

      {/* Revenue */}
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">Revenue (บาท)</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="ค่าขนส่ง" value={money(data.revenue["ค่าขนส่ง"])} icon={Banknote} accent="bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400" />
          <Kpi label="ค่าโอนย้าย" value={money(data.revenue["ค่าโอนย้าย"])} icon={Banknote} accent="bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400" />
          <Kpi label="ประกันรายได้ + ค่าอื่นๆ" value={money(data.revenue["ประกันรายได้ + ค่าอื่นๆ"])} icon={Banknote} accent="bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400" />
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white"><Banknote size={14} /></span>
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">รวมรายได้</span>
            </div>
            <p className="text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-200">{money(data.revenue["รวม"])}</p>
          </div>
        </div>
      </div>

      {/* Revenue by fleet */}
      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/3 p-4">
        <p className="mb-2 text-[12px] font-semibold text-gray-500 dark:text-gray-400">รายได้ตาม Fleet</p>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={chart} margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" interval={0} angle={-15} textAnchor="end" height={46} />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={70}
                tickFormatter={(v) => Number(v).toLocaleString(undefined, { notation: "compact" })} />
              <Tooltip formatter={(v: unknown) => Number(v).toLocaleString()} />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {chart.map((_, i) => <Cell key={i} fill={FLEET_COLORS[i % FLEET_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
