import { redirect } from "next/navigation"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/login")
  const { isAdmin } = await getUserPermissions(session.user?.email)
  if (!isAdmin) redirect("/unauthorized")
  return <>{children}</>
}
