"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useSession, signOut } from "next-auth/react"
import {
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  LayoutDashboard,
  Users,
  LogOut,
  Shield,
  Database,
  Waypoints,
  Warehouse,
  Truck,
  Workflow,
  SlidersHorizontal,
  FolderCog,
  Fuel,
  Droplets,
  Share2,
  Layers,
  Gauge,
} from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

// ── Logo ────────────────────────────────────────────────────────
function MenaLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="url(#mg)" />
      <path d="M7 22 C7 15 14 10 25 10" stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" fill="none" />
      <circle cx="7"  cy="22" r="2.2" fill="white" opacity="0.85" />
      <circle cx="25" cy="10" r="2.2" fill="white" opacity="0.85" />
      <rect x="10" y="17.5" width="5" height="5" rx="1" fill="white" opacity="0.85" />
      <rect x="14" y="15.5" width="9" height="7" rx="1" fill="white" />
      <circle cx="12.5" cy="23.2" r="1.4" fill="url(#mg)" />
      <circle cx="20.5" cy="23.2" r="1.4" fill="url(#mg)" />
      <defs>
        <linearGradient id="mg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>
      </defs>
    </svg>
  )
}

// ── Types ───────────────────────────────────────────────────────
type NavItem  = { href: string; label: string; icon: React.ElementType; exact?: boolean }
type NavGroup = {
  label:          string
  groupIcon:      React.ElementType
  permissionKey?: string
  dot:            string   // accent color, also used as the active indicator bar
  iconColor:      string   // group header icon color
  activeBg:       string
  activeText:     string
  items:          NavItem[]
  /** false = render items flat, no header button / dropdown to open */
  collapsible?:   boolean
}

// ── Nav config ──────────────────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label:        "Overview",
    groupIcon:    LayoutDashboard,
    dot:          "bg-gray-400",
    iconColor:    "text-gray-500 dark:text-gray-400",
    activeBg:     "bg-gray-100 dark:bg-white/8",
    activeText:   "text-gray-900 dark:text-white",
    collapsible:  false,
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label:        "Data Pipeline",
    groupIcon:    Waypoints,
    permissionKey: "bi",
    dot:          "bg-sky-500",
    iconColor:    "text-sky-500 dark:text-sky-400",
    activeBg:     "bg-sky-50 dark:bg-sky-950/40",
    activeText:   "text-sky-700 dark:text-sky-300",
    items: [
      { href: "/datapipeline/flows", label: "Flows", icon: Workflow },
      { href: "/datapipeline/datasource", label: "Datasource", icon: Database },
      { href: "/datapipeline/conditions", label: "Conditions", icon: SlidersHorizontal },
      { href: "/datapipeline/data", label: "Data", icon: Warehouse },
    ],
  },
  {
    label:        "Data Modeling",
    groupIcon:    Share2,
    permissionKey: "bi",
    dot:          "bg-cyan-500",
    iconColor:    "text-cyan-500 dark:text-cyan-400",
    activeBg:     "bg-cyan-50 dark:bg-cyan-950/40",
    activeText:   "text-cyan-700 dark:text-cyan-300",
    items: [
      { href: "/datamodeling/model", label: "Model View", icon: Share2 },
      { href: "/datamodeling/mart", label: "Data Mart", icon: Layers },
      { href: "/datamodeling/pivot", label: "Pivot Dashboard", icon: Gauge },
    ],
  },
  {
    label:        "Master Data",
    groupIcon:    FolderCog,
    permissionKey: "bi",
    dot:          "bg-indigo-500",
    iconColor:    "text-indigo-500 dark:text-indigo-400",
    activeBg:     "bg-indigo-50 dark:bg-indigo-950/40",
    activeText:   "text-indigo-700 dark:text-indigo-300",
    items: [
      { href: "/masterdata/mastertruck", label: "Master รถ", icon: Truck },
      { href: "/masterdata/fuelrate", label: "Master ราคาน้ำมัน", icon: Fuel },
    ],
  },
  {
    label:        "Admin",
    groupIcon:    Shield,
    permissionKey: "admin",
    dot:          "bg-slate-500",
    iconColor:    "text-slate-500 dark:text-slate-400",
    activeBg:     "bg-slate-100 dark:bg-slate-800/40",
    activeText:   "text-slate-700 dark:text-slate-300",
    items: [
      { href: "/admin/users",  label: "Users",  icon: Users },
      { href: "/admin/groups", label: "Groups", icon: Shield },
    ],
  },
]


// ── Sidebar ─────────────────────────────────────────────────────
export function Sidebar({
  isMobile = false,
  mobileOpen = false,
  onMobileClose,
  allowedGroups = [],
}: {
  isMobile?: boolean
  mobileOpen?: boolean
  onMobileClose?: () => void
  allowedGroups?: string[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname  = usePathname()
  const { data: session } = useSession()

  function isActive(href: string, exact?: boolean) {
    // match the page itself or its sub-pages only — plain startsWith would make
    // "/datapipeline/data" light up while on "/datapipeline/datasource"
    if (exact) return pathname === href
    return pathname === href || pathname.startsWith(href + "/")
  }

  const isCollapsed   = !isMobile && collapsed
  const visibleGroups = NAV_GROUPS.filter(
    g => !g.permissionKey || allowedGroups.includes(g.permissionKey)
  )

  // Groups are collapsed by default; the group containing the active page is open
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const active = visibleGroups.find(g => g.items.some(i => isActive(i.href, i.exact)))
    return new Set(active ? [active.label] : [])
  })

  // Keep the group of the current page open when navigating (e.g. via links outside the sidebar)
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    const active = visibleGroups.find(g => g.items.some(i => isActive(i.href, i.exact)))
    if (active && !openGroups.has(active.label)) {
      setOpenGroups(prev => new Set(prev).add(active.label))
    }
  }

  function toggleGroup(label: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  return (
    <aside className={`
      flex h-screen flex-col shrink-0 select-none
      border-r border-gray-200 dark:border-white/8
      bg-white dark:bg-[#0f1117]
      transition-all duration-250 ease-in-out
      ${isMobile
        ? `fixed inset-y-0 left-0 z-50 w-[232px] shadow-2xl ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`
        : collapsed ? "w-[62px]" : "w-[232px]"
      }
    `}>

      {/* ── Brand ─────────────────────────────────────────────── */}
      <div className={`flex h-[56px] shrink-0 items-center border-b border-gray-100 dark:border-white/6
        ${isCollapsed ? "justify-center" : "gap-3 px-4"}`}>
        <Link href="/" className="shrink-0" title="Mena BI">
          <MenaLogo size={30} />
        </Link>
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
              Mena BI
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">Business Intelligence</p>
          </div>
        )}
        {isMobile && (
          <button
            onClick={onMobileClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-400
              hover:bg-gray-100 dark:hover:bg-white/8 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── Nav ───────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 px-2">
        {visibleGroups.map((group) => {
          const isCollapsible = group.collapsible !== false
          const groupOpen     = isCollapsible ? openGroups.has(group.label) : true
          const hasActiveItem = group.items.some(i => isActive(i.href, i.exact))

          return (
            <div key={group.label} className="mb-1">

              {/* Group header */}
              {isCollapsed ? (
                // In collapsed mode: just a thin colored divider (skip non-collapsible groups, e.g. Overview)
                isCollapsible && (
                  <div className={`mx-3 my-2 h-[2px] rounded-full ${group.dot} opacity-30`} />
                )
              ) : !isCollapsible ? null : (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="group flex w-full items-center gap-2.5 px-2.5 py-2 rounded-lg
                    hover:bg-gray-50 dark:hover:bg-white/4 transition-colors"
                >
                  {/* Group icon */}
                  {(() => {
                    const GIcon = group.groupIcon
                    return (
                      <GIcon
                        size={16}
                        className={`shrink-0 transition-colors ${
                          hasActiveItem
                            ? group.iconColor
                            : "text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400"
                        }`}
                      />
                    )
                  })()}
                  <span className={`flex-1 text-left text-[13px] font-semibold transition-colors
                    ${hasActiveItem
                      ? "text-gray-800 dark:text-gray-100"
                      : "text-gray-600 dark:text-gray-300 group-hover:text-gray-800 dark:group-hover:text-gray-100"
                    }`}>
                    {group.label}
                  </span>
                  <ChevronDown
                    size={13}
                    className={`shrink-0 text-gray-300 dark:text-gray-600 transition-transform duration-200
                      ${groupOpen ? "" : "-rotate-90"}`}
                  />
                </button>
              )}

              {/* Nav items — nested under the group header with a tree guide line */}
              {(isCollapsed || groupOpen) && (
                <div className={
                  isCollapsed || !isCollapsible
                    ? "space-y-0.5"
                    : "mt-0.5 mb-1.5 ml-4.5 space-y-0.5 border-l border-gray-200 pl-1.5 dark:border-white/8"
                }>
                  {group.items.map((item) => {
                    const Icon   = item.icon
                    const active = isActive(item.href, item.exact)

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={isMobile ? onMobileClose : undefined}
                        title={isCollapsed ? item.label : undefined}
                        className={`
                          group relative flex items-center rounded-lg
                          transition-colors duration-150
                          ${isCollapsed
                            ? "justify-center py-2.5 px-0 text-[13px]"
                            : isCollapsible
                              ? "gap-2.5 px-2 py-1.5 text-[12.5px]"
                              : "gap-2.5 px-2.5 py-2 text-[13px]"}
                          ${active
                            ? `${group.activeBg} ${group.activeText} font-semibold`
                            : `font-medium text-gray-500 dark:text-gray-400
                               hover:bg-gray-50 dark:hover:bg-white/5
                               hover:text-gray-800 dark:hover:text-gray-200`
                          }
                        `}
                      >
                        {/* active indicator — absolute so it never shifts the icon/label */}
                        {active && (
                          <span className={`absolute left-0 top-1/2 h-4 w-0.75 -translate-y-1/2 rounded-r-full ${group.dot}`} />
                        )}
                        <Icon
                          size={isCollapsed || !isCollapsible ? 15 : 14}
                          className={`shrink-0 transition-colors
                            ${active ? group.activeText : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"}`}
                        />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}

                        {/* Tooltip in collapsed mode */}
                        {isCollapsed && (
                          <span className="
                            pointer-events-none absolute left-[calc(100%+8px)] z-50
                            whitespace-nowrap rounded-lg
                            border border-gray-200 dark:border-white/10
                            bg-white dark:bg-[#1e2130]
                            px-3 py-1.5 text-[12px] font-medium
                            text-gray-700 dark:text-white
                            shadow-lg
                            opacity-0 -translate-x-1
                            group-hover:opacity-100 group-hover:translate-x-0
                            transition-all duration-150
                          ">
                            {item.label}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* ── Collapse toggle ────────────────────────────────────── */}
      {!isMobile && (
        <div className="px-2 pb-1 pt-1 border-t border-gray-100 dark:border-white/6">
          <button
            onClick={() => setCollapsed(c => !c)}
            className={`flex w-full items-center rounded-lg py-2 text-[12px] font-medium
              text-gray-400 dark:text-gray-500
              hover:bg-gray-50 dark:hover:bg-white/6
              hover:text-gray-700 dark:hover:text-gray-300
              transition-colors
              ${isCollapsed ? "justify-center" : "gap-2.5 px-2.5"}`}
          >
            {collapsed
              ? <PanelLeftOpen size={15} className="shrink-0" />
              : <>
                  <PanelLeftClose size={15} className="shrink-0" />
                  <span>หุบเมนู</span>
                </>
            }
          </button>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 dark:border-white/6 px-2 py-2 space-y-1">
        <ThemeToggle collapsed={isCollapsed} />

        {session?.user && (
          isCollapsed ? (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="flex w-full items-center justify-center rounded-lg py-2
                text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/20 hover:text-red-500 transition-colors"
            >
              <LogOut size={15} />
            </button>
          ) : (
            <div className="rounded-xl border border-gray-100 dark:border-white/6 bg-gray-50 dark:bg-white/3 px-3 py-2.5">
              <div className="flex items-center gap-2.5 mb-2.5">
                {session.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.user.image} alt=""
                    className="h-7 w-7 rounded-full ring-1 ring-gray-200 dark:ring-white/10 shrink-0" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold shrink-0">
                    {session.user.name?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-gray-800 dark:text-white truncate leading-tight">
                    {session.user.name?.split(" ")[0]}
                  </p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate leading-tight">
                    {session.user.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg
                  border border-gray-200 dark:border-white/8 py-1.5
                  text-[11px] font-medium text-gray-500 dark:text-gray-400
                  hover:bg-red-50 dark:hover:bg-red-950/20
                  hover:text-red-500 hover:border-red-200 dark:hover:border-red-800/40 transition-colors"
              >
                <LogOut size={11} />
                Sign out
              </button>
            </div>
          )
        )}
      </div>
    </aside>
  )
}
