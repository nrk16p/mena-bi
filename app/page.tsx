import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import { Dashboard } from "@/components/dashboard"

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    redirect("/login")
  }

  const { isAdmin, allowedGroups } = await getUserPermissions(session.user.email)
  if (!isAdmin && allowedGroups.length === 0) {
    redirect("/pending-access")
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Mena BI</h1>
        <p className="text-[13px] text-gray-400 dark:text-gray-500">
          ภาพรวมสรุปรายรถ — Performance &amp; Revenue
        </p>
      </div>
      <Dashboard />
    </div>
  )
}
