"use client"

import { Truck } from "lucide-react"
import { MasterTable } from "@/components/master-table"

export default function MasterTruckPage() {
  return (
    <MasterTable
      masterKey="mastertruck"
      icon={<Truck size={18} className="text-indigo-600 dark:text-indigo-400" />}
      searchPlaceholder="ค้นหา ทะเบียน/บริการ/ศูนย์..."
      templateExample={{ YM: 202605, ศูนย์: "สระบุรี", ทะเบียนรถ: "สบ.00-0000" }}
    />
  )
}
