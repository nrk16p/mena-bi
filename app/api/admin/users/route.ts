import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { ObjectId } from "mongodb"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import clientPromise from "@/lib/mongo"

async function getAdminSession() {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email ?? null
  const perms = await getUserPermissions(email)
  return perms.isAdmin ? email : null
}

export async function GET() {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const client = await clientPromise
  const db = client.db("atms")
  // Unassigned users (empty group_ids) first, then by last_seen desc
  const users = await db
    .collection("bi_app_users")
    .find({})
    .sort({ last_seen: -1 })
    .toArray()

  // Sort: unassigned first
  users.sort((a, b) => {
    const aEmpty = !Array.isArray(a.group_ids) || a.group_ids.length === 0
    const bEmpty = !Array.isArray(b.group_ids) || b.group_ids.length === 0
    if (aEmpty && !bEmpty) return -1
    if (!aEmpty && bEmpty) return 1
    return 0
  })

  return NextResponse.json({ success: true, data: users })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const { email, group_ids } = (await req.json()) as {
      email: string
      group_ids?: string[]
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 })
    }

    const client = await clientPromise
    const db = client.db("atms")

    const existing = await db.collection("bi_app_users").findOne({ email })
    if (existing) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 })
    }

    const objectIds = Array.isArray(group_ids) && group_ids.length
      ? group_ids.map((id) => new ObjectId(id))
      : []

    await db.collection("bi_app_users").insertOne({
      email,
      name: email.split("@")[0],
      image: "",
      group_ids: objectIds,
      created_at: new Date(),
      last_seen: null,
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof Error && (e.name === "BSONError" || e.constructor.name === "BSONError")) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const { email, group_ids } = (await req.json()) as {
      email: string
      group_ids: string[]
    }

    const client = await clientPromise
    const db = client.db("atms")

    if (!Array.isArray(group_ids) || group_ids.length === 0) {
      await db.collection("bi_app_users").updateOne(
        { email },
        { $set: { group_ids: [] } }
      )
      return NextResponse.json({ success: true })
    }

    const objectIds = group_ids.map((id) => new ObjectId(id))
    const groups = await db
      .collection("bi_permission_groups")
      .find({ _id: { $in: objectIds } })
      .toArray()
    if (!groups.length) return NextResponse.json({ error: "Group not found" }, { status: 404 })

    await db.collection("bi_app_users").updateOne(
      { email },
      { $set: { group_ids: objectIds } }
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof Error && (e.name === "BSONError" || e.constructor.name === "BSONError")) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
