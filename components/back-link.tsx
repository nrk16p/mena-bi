import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium
        text-gray-400 dark:text-gray-500
        hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
    >
      <ArrowLeft size={13} />
      {label}
    </Link>
  )
}
