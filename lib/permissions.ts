import { ObjectId } from "mongodb"
import clientPromise from "@/lib/mongo"

export type UserPermissions = {
  isAdmin: boolean
  allowedGroups: string[]
}

const ALL_GROUPS = ["bi", "admin"]

export async function getUserPermissions(
  email: string | null | undefined
): Promise<UserPermissions> {
  if (!email) return { isAdmin: false, allowedGroups: [] }

  try {
    const client = await clientPromise
    const db = client.db("atms")

    const user = await db.collection("bi_app_users").findOne({ email })
    if (!user) return { isAdmin: false, allowedGroups: [] }

    // Support both group_ids (array) and legacy group_id (singular)
    const rawIds: unknown[] = Array.isArray(user.group_ids) && user.group_ids.length
      ? user.group_ids
      : user.group_id
        ? [user.group_id]
        : []
    if (!rawIds.length) return { isAdmin: false, allowedGroups: [] }

    const objectIds = rawIds.map((id) => new ObjectId(String(id)))
    const groups = await db
      .collection("bi_permission_groups")
      .find({ _id: { $in: objectIds } })
      .toArray()

    if (!groups.length) return { isAdmin: false, allowedGroups: [] }

    if (groups.some((g) => g.is_admin)) {
      return { isAdmin: true, allowedGroups: ALL_GROUPS }
    }

    const merged = [...new Set(groups.flatMap((g) => (g.access as string[]) ?? []))]
    return { isAdmin: false, allowedGroups: merged }
  } catch {
    return { isAdmin: false, allowedGroups: [] }
  }
}
