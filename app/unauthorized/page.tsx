"use client"

import Link from "next/link"
import { ShieldX } from "lucide-react"

export default function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <ShieldX size={48} className="text-gray-300 dark:text-gray-600 mb-4" />
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white mb-2">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
        กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การเข้าถึง
      </p>
      <Link
        href="/"
        className="rounded-lg bg-gray-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:opacity-90 transition-opacity"
      >
        กลับหน้าหลัก
      </Link>
    </div>
  )
}
