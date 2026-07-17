import Link from "next/link"
import { Banknote, Droplets, LayoutGrid, Scale, Truck, Users, Warehouse } from "lucide-react"

type Tone = "amber" | "emerald" | "sky" | "violet"

const TONE_STYLES: Record<Tone, { badgeBg: string; badgeText: string; folder: string; border: string }> = {
  amber: {
    badgeBg: "bg-amber-100 dark:bg-amber-950/50",
    badgeText: "text-amber-600 dark:text-amber-400",
    folder: "text-amber-400 dark:text-amber-700",
    border: "hover:border-amber-300 dark:hover:border-amber-700",
  },
  emerald: {
    badgeBg: "bg-emerald-100 dark:bg-emerald-950/50",
    badgeText: "text-emerald-600 dark:text-emerald-400",
    folder: "text-emerald-400 dark:text-emerald-700",
    border: "hover:border-emerald-300 dark:hover:border-emerald-700",
  },
  sky: {
    badgeBg: "bg-sky-100 dark:bg-sky-950/50",
    badgeText: "text-sky-600 dark:text-sky-400",
    folder: "text-sky-400 dark:text-sky-700",
    border: "hover:border-sky-300 dark:hover:border-sky-700",
  },
  violet: {
    badgeBg: "bg-violet-100 dark:bg-violet-950/50",
    badgeText: "text-violet-600 dark:text-violet-400",
    folder: "text-violet-400 dark:text-violet-700",
    border: "hover:border-violet-300 dark:hover:border-violet-700",
  },
}

const TOPICS: {
  href: string
  label: string
  description: string
  icon: React.ElementType
  tone: Tone
}[] = [
  {
    href: "/datapipeline/data/trip",
    label: "Trip",
    description: "เที่ยววิ่ง (unique LDT)",
    icon: Truck,
    tone: "amber",
  },
  {
    href: "/datapipeline/data/weight",
    label: "Master น้ำหนัก",
    description: "น้ำหนักต่อเที่ยว",
    icon: Scale,
    tone: "emerald",
  },
  {
    href: "/datapipeline/data/fuel-qty",
    label: "Master จำนวนเชื้อเพลิง",
    description: "ปริมาณเชื้อเพลิงต่อเที่ยว",
    icon: Droplets,
    tone: "emerald",
  },
  {
    href: "/datapipeline/data/transport-cost",
    label: "Master ค่าขนส่ง",
    description: "ค่าจัดส่งแยกประเภทรายได้",
    icon: Banknote,
    tone: "sky",
  },
  {
    href: "/datapipeline/data/driver-cost",
    label: "Master ค่าเที่ยว พจส",
    description: "ค่าจัดส่งแยกประเภทรายได้",
    icon: Users,
    tone: "sky",
  },
  {
    href: "/datapipeline/data/summary",
    label: "Summary Data",
    description: "สรุปรายรถ (Master × น้ำหนัก × ค่าขนส่ง)",
    icon: LayoutGrid,
    tone: "violet",
  },
]

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" className={className} fill="none">
      <path
        d="M4 6C4 4.34 5.34 3 7 3h10.17c.8 0 1.56.32 2.12.88L22 6.71c.56.56 1.33.88 2.12.88H41c1.66 0 3 1.34 3 3v24c0 1.66-1.34 3-3 3H7c-1.66 0-3-1.34-3-3V6Z"
        fill="currentColor"
        opacity="0.45"
      />
      <path
        d="M2 16c0-1.66 1.34-3 3-3h38c1.66 0 3 1.34 3 3v18c0 1.66-1.34 3-3 3H5c-1.66 0-3-1.34-3-3V16Z"
        fill="currentColor"
      />
    </svg>
  )
}

function FolderCard({
  href,
  label,
  description,
  icon: Icon,
  tone,
}: {
  href: string
  label: string
  description: string
  icon: React.ElementType
  tone: Tone
}) {
  const t = TONE_STYLES[tone]
  return (
    <Link
      href={href}
      className={`group flex flex-col items-center gap-3 rounded-2xl border border-gray-200 dark:border-white/8
        bg-white dark:bg-white/3 p-6 text-center transition-colors ${t.border}`}
    >
      <div className="relative">
        <FolderIcon className={`h-16 w-20 transition-transform group-hover:-translate-y-0.5 ${t.folder}`} />
        <div
          className={`absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-lg
            ring-2 ring-white dark:ring-[#0f1117] ${t.badgeBg}`}
        >
          <Icon size={13} className={t.badgeText} />
        </div>
      </div>
      <div>
        <p className="text-[13px] font-bold text-gray-900 dark:text-white">{label}</p>
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{description}</p>
      </div>
    </Link>
  )
}

export default function DataPage() {
  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-950/50">
          <Warehouse size={18} className="text-sky-600 dark:text-sky-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Data</h1>
          <p className="text-[12px] text-gray-400 dark:text-gray-500">
            คลังข้อมูลที่ผ่านการประมวลผลแล้ว แยกตามหัวข้อ
          </p>
        </div>
      </div>

      {/* Topics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {TOPICS.map((topic) => (
          <FolderCard key={topic.href} {...topic} />
        ))}
      </div>
    </div>
  )
}
