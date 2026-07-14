"use client"

import { useEffect, useState } from "react"

type AppUser = {
  _id: string
  email: string
  name: string
  image: string
  group_ids: string[]
  last_seen: string
}

type Group = {
  _id: string
  name: string
  is_admin: boolean
  access: string[]
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [pendingGroups, setPendingGroups] = useState<Record<string, string[]>>({})

  const [addEmail, setAddEmail] = useState("")
  const [addGroupIds, setAddGroupIds] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function loadUsers() {
    const [u, g] = await Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/groups").then((r) => r.json()),
    ])
    const fetchedUsers: AppUser[] = (u.data ?? []).map((user: AppUser & { group_ids?: string[] }) => ({
      ...user,
      group_ids: Array.isArray(user.group_ids) ? user.group_ids.map(String) : [],
    }))
    setUsers(fetchedUsers)
    setGroups(g.data ?? [])
    const initial: Record<string, string[]> = {}
    for (const user of fetchedUsers) {
      initial[user.email] = user.group_ids ?? []
    }
    setPendingGroups(initial)
  }

  useEffect(() => { loadUsers() }, [])

  async function addUser() {
    if (!addEmail.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail.trim().toLowerCase(), group_ids: addGroupIds }),
      })
      if (!res.ok) {
        const data = await res.json()
        setAddError(data.error ?? "เกิดข้อผิดพลาด")
        return
      }
      setAddEmail("")
      setAddGroupIds([])
      await loadUsers()
    } finally {
      setAdding(false)
    }
  }

  function toggleAddGroup(groupId: string) {
    setAddGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    )
  }

  function toggleGroup(email: string, groupId: string) {
    setPendingGroups((prev) => {
      const current = prev[email] ?? []
      const next = current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId]
      return { ...prev, [email]: next }
    })
  }

  async function saveUser(email: string) {
    setSaving(email)
    try {
      const group_ids = pendingGroups[email] ?? []
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, group_ids }),
      })
      const res = await fetch("/api/admin/users").then((r) => r.json())
      const newUsers: AppUser[] = (res.data ?? []).map((user: AppUser & { group_ids?: string[] }) => ({
        ...user,
        group_ids: Array.isArray(user.group_ids) ? user.group_ids.map(String) : [],
      }))
      setUsers(newUsers)
      setPendingGroups((prev) => {
        const updated = { ...prev }
        for (const user of newUsers) {
          if (!(user.email in updated)) {
            updated[user.email] = user.group_ids ?? []
          }
        }
        return updated
      })
    } finally {
      setSaving(null)
    }
  }

  const unassigned = users.filter((u) => !u.group_ids?.length)
  const assigned = users.filter((u) => u.group_ids?.length)

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">จัดการผู้ใช้งาน</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          กำหนดกลุ่มสิทธิ์ให้กับแต่ละผู้ใช้ (เลือกได้หลายกลุ่ม)
        </p>
      </div>

      {/* Add user form */}
      <div className="mb-6 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] p-4">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">เพิ่มผู้ใช้ใหม่</p>
        <div className="flex flex-wrap gap-3 items-start">
          <input
            type="email"
            placeholder="อีเมล @menatransport.co.th"
            value={addEmail}
            onChange={(e) => { setAddEmail(e.target.value); setAddError(null) }}
            onKeyDown={(e) => e.key === "Enter" && addUser()}
            className="flex-1 min-w-48 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center pt-1.5">
            {groups.map((g) => (
              <label key={String(g._id)} className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addGroupIds.includes(String(g._id))}
                  onChange={() => toggleAddGroup(String(g._id))}
                  className="h-3.5 w-3.5 rounded border-gray-300 dark:border-white/20 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 bg-white dark:bg-white/10"
                />
                <span className="text-xs text-gray-700 dark:text-gray-300">{g.name}</span>
              </label>
            ))}
          </div>
          <button
            onClick={addUser}
            disabled={adding || !addEmail.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {adding ? "กำลังเพิ่ม..." : "+ เพิ่มผู้ใช้"}
          </button>
        </div>
        {addError && <p className="mt-2 text-xs text-red-500">{addError}</p>}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-white/6">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">ผู้ใช้</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">เข้าใช้ล่าสุด</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">กลุ่มสิทธิ์</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {[...unassigned, ...assigned].map((user) => (
              <tr key={user.email} className="border-b border-gray-50 dark:border-white/4 last:border-0">
                <td className="px-4 py-3 align-top">
                  <div className="flex items-center gap-3">
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.image} alt="" className="h-8 w-8 rounded-full flex-shrink-0" />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold flex-shrink-0">
                        {user.name?.[0] ?? "?"}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs align-top pt-4">
                  {user.last_seen ? new Date(user.last_seen).toLocaleDateString("th-TH") : "-"}
                </td>
                <td className="px-4 py-3 align-top">
                  {(!user.group_ids?.length) && (
                    <span className="inline-block mb-2 rounded-full bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                      ยังไม่ได้กำหนด
                    </span>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {groups.map((g) => {
                      const checked = (pendingGroups[user.email] ?? []).includes(String(g._id))
                      return (
                        <label
                          key={String(g._id)}
                          className="flex items-center gap-1.5 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleGroup(user.email, String(g._id))}
                            className="h-3.5 w-3.5 rounded border-gray-300 dark:border-white/20 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 bg-white dark:bg-white/10"
                          />
                          <span className="text-xs text-gray-700 dark:text-gray-300">{g.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 align-top pt-4">
                  <button
                    onClick={() => saveUser(user.email)}
                    disabled={saving === user.email}
                    className="rounded-lg bg-gray-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-40 transition-opacity whitespace-nowrap"
                  >
                    {saving === user.email ? "กำลังบันทึก..." : "บันทึก"}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  ยังไม่มีผู้ใช้ลงทะเบียน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
