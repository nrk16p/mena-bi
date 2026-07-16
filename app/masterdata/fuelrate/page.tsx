"use client"

import { Fuel } from "lucide-react"
import { MasterTable } from "@/components/master-table"

export default function FuelRatePage() {
  return (
    <MasterTable
      masterKey="fuelrate"
      icon={<Fuel size={18} className="text-indigo-600 dark:text-indigo-400" />}
      searchPlaceholder="ค้นหา Fleet..."
      templateExample={{ YM: 202605, Fleet: "Mixer", "ราคาน้ำมัน/ลิตร": 37.54 }}
    />
  )
}
