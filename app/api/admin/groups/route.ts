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
  const groups = await db
    .collection("bi_permission_groups")
    .find({})
    .sort({ name: 1 })
    .toArray()

  return NextResponse.json({ success: true, data: groups })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const { name, is_admin, access } = (await req.json()) as {
      name: string
      is_admin: boolean
      access: string[]
    }

    const client = await clientPromise
    const db = client.db("atms")
    const now = new Date()
    const result = await db.collection("bi_permission_groups").insertOne({
      name,
      is_admin,
      access,
      created_at: now,
      updated_at: now,
    })

    const doc = await db.collection("bi_permission_groups").findOne({ _id: result.insertedId })
    return NextResponse.json({ success: true, data: doc })
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
    const { id, name, is_admin, access } = (await req.json()) as {
      id: string
      name: string
      is_admin: boolean
      access: string[]
    }

    const client = await clientPromise
    const db = client.db("atms")

    await db.collection("bi_permission_groups").updateOne(
      { _id: new ObjectId(id) },
      { $set: { name, is_admin, access, updated_at: new Date() } }
    )

    // Update denormalized group_name in app_users
    await db.collection("bi_app_users").updateMany(
      { group_id: new ObjectId(id) },
      { $set: { group_name: name } }
    )

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof Error && (e.name === "BSONError" || e.constructor.name === "BSONError")) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await getAdminSession()
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const { id } = (await req.json()) as { id: string }

    const client = await clientPromise
    const db = client.db("atms")

    // Unassign all users in this group first
    await db.collection("bi_app_users").updateMany(
      { group_id: new ObjectId(id) },
      { $set: { group_id: null, group_name: null } }
    )

    await db.collection("bi_permission_groups").deleteOne({ _id: new ObjectId(id) })

    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof Error && (e.name === "BSONError" || e.constructor.name === "BSONError")) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
