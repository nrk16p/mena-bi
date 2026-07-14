import "./globals.css"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import { Providers } from "@/components/providers"
import { AppShell } from "@/components/app-shell"

export const metadata = {
  title: "Mena BI",
  description: "Business Intelligence Platform",
  icons: { icon: "/logo.svg" },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  const { allowedGroups } = await getUserPermissions(session?.user?.email)

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body className="flex h-screen overflow-hidden bg-[#f5f5f7] dark:bg-[#0a0a10]">
        <Providers>
          <AppShell allowedGroups={allowedGroups}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
