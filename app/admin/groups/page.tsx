"use client"

import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, X, Check } from "lucide-react"

const SECTION_KEYS = [
  { key: "bi", label: "BI Access" },
]

type Group = {
  _id: string
  name: string
  is_admin: boolean
  access: string[]
}

type FormState = {
  name: string
  is_admin: boolean
  access: string[]
}

const EMPTY_FORM: FormState = { name: "", is_admin: false, access: [] }

export default function AdminGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function load() {
    const res = await fetch("/api/admin/groups").then((r) => r.json())
    setGroups(res.data ?? [])
  }

  useEffect(() => { load() }, [])

  function toggleAccess(key: string) {
    setForm((f) => ({
      ...f,
      access: f.access.includes(key) ? f.access.filter((k) => k !== key) : [...f.access, key],
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingId) {
        await fetch("/api/admin/groups", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...form }),
        })
      } else {
        await fetch("/api/admin/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
      }
      await load()
      setShowForm(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("ลบกลุ่มนี้? ผู้ใช้ที่อยู่ในกลุ่มจะถูกยกเลิกสิทธิ์ทั้งหมด")) return
    setDeleting(id)
    try {
      await fetch("/api/admin/groups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      await load()
    } finally {
      setDeleting(null)
    }
  }

  function startEdit(group: Group) {
    setEditingId(String(group._id))
    setForm({ name: group.name, is_admin: group.is_admin, access: group.access })
    setShowForm(true)
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">กลุ่มสิทธิ์</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            กำหนดว่าแต่ละกลุ่มเข้าถึงส่วนใดของระบบได้บ้าง
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true) }}
            className="flex items-center gap-2 rounded-lg bg-gray-900 dark:bg-white px-3 py-2 text-sm font-medium text-white dark:text-gray-900 hover:opacity-80 transition-opacity"
          >
            <Plus size={14} />
            สร้างกลุ่มใหม่
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 p-4">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">
            {editingId ? "แก้ไขกลุ่ม" : "สร้างกลุ่มใหม่"}
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">ชื่อกลุ่ม</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="เช่น Fuel Team, OPS Team"
                className="block w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_admin"
                checked={form.is_admin}
                onChange={(e) => setForm((f) => ({ ...f, is_admin: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="is_admin" className="text-sm text-gray-700 dark:text-gray-300">
                Admin (เข้าถึงได้ทุกส่วน)
              </label>
            </div>

            {!form.is_admin && (
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">ส่วนที่เข้าถึงได้</p>
                <div className="flex flex-wrap gap-2">
                  {SECTION_KEYS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => toggleAccess(key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
                        form.access.includes(key)
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-gray-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-gray-900 hover:opacity-80 disabled:opacity-40 transition-opacity"
              >
                <Check size={13} />
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM) }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-white/10 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/6 transition-colors"
              >
                <X size={13} />
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Groups list */}
      <div className="space-y-3">
        {groups.map((group) => (
          <div
            key={String(group._id)}
            className="rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-[#0f1117] px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-gray-900 dark:text-white">{group.name}</span>
                {group.is_admin && (
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Admin
                  </span>
                )}
              </div>
              {!group.is_admin && (
                <div className="flex flex-wrap gap-1">
                  {group.access.length === 0 ? (
                    <span className="text-xs text-gray-400">ไม่มีสิทธิ์เพิ่มเติม</span>
                  ) : (
                    group.access.map((key) => (
                      <span
                        key={key}
                        className="rounded-full bg-gray-100 dark:bg-white/8 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-300"
                      >
                        {key}
                      </span>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => startEdit(group)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-700 dark:hover:text-white transition-colors"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => handleDelete(String(group._id))}
                disabled={deleting === String(group._id)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 transition-colors disabled:opacity-40"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">ยังไม่มีกลุ่มสิทธิ์</p>
        )}
      </div>
    </div>
  )
}
