"use client"

import { Ruler } from "lucide-react"
import { MasterTable } from "@/components/master-table"

export default function PerformanceLogicPage() {
  return (
    <MasterTable
      masterKey="performancelogic"
      icon={<Ruler size={18} className="text-indigo-600 dark:text-indigo-400" />}
      searchPlaceholder="ค้นหา Fleet / Site / Logic..."
      templateExample={{ Fleet: "Mixer L", Site: "Asia", Logic: "น้ำหนัก" }}
    />
  )
}
