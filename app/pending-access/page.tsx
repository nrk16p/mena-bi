"use client"

import { useSession, signOut } from "next-auth/react"
import { Clock } from "lucide-react"

export default function PendingAccessPage() {
  const { data: session } = useSession()

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/30 mb-5">
        <Clock size={32} className="text-amber-500" />
      </div>

      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        รอการอนุมัติสิทธิ์
      </h1>

      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed mb-1">
        บัญชี <span className="font-medium text-gray-700 dark:text-gray-300">{session?.user?.email}</span> ยังไม่ได้รับสิทธิ์เข้าใช้งาน
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed mb-8">
        กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การเข้าถึง
      </p>

      <div className="flex flex-col items-center gap-3">
        <a
          href="mailto:narongkorn.a@menatransport.co.th?subject=ขอสิทธิ์เข้าใช้งาน Mena BI"
          className="rounded-lg bg-gray-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-gray-900 hover:opacity-90 transition-opacity"
        >
          ส่งอีเมลขอสิทธิ์
        </a>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  )
}
