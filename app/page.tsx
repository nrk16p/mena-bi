import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

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
    <div className="flex h-full min-h-[70vh] items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Mena BI
        </h1>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Business Intelligence Platform
        </p>
      </div>
    </div>
  )
}
