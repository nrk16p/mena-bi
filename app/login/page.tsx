"use client"

import { signIn, useSession } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, Suspense } from "react"

const bgStyle: React.CSSProperties = {
  backgroundImage: "url('/login-bg.jpg')",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
}

function LoginContent() {
  const { status } = useSession()
  const router      = useRouter()
  const searchParams = useSearchParams()
  const error        = searchParams.get("error")
  const callbackUrl  = searchParams.get("callbackUrl") ?? "/"

  useEffect(() => {
    if (status === "authenticated") router.replace(callbackUrl)
  }, [status, router, callbackUrl])

  if (status === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={bgStyle}>
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative z-10 text-[10px] tracking-[0.3em] text-white/50 uppercase">
          Loading
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={bgStyle}>
      {/* overlay */}
      <div className="absolute inset-0 bg-black/20" />

      {/* green glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-96 h-96 rounded-full bg-green-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Card */}
        <div className="rounded-3xl border border-white/15 bg-white/10 backdrop-blur-xl px-8 py-9 shadow-2xl shadow-black/30">

          {/* Logo mark */}
          <div className="flex justify-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500/20 border border-green-400/30 backdrop-blur-sm">
              <span className="text-2xl font-black text-green-300">M</span>
            </div>
          </div>

          {/* Brand */}
          <div className="text-center mb-7">
            <h1 className="text-[1.6rem] font-black tracking-[0.15em] uppercase bg-clip-text text-transparent bg-linear-to-r from-green-300 via-emerald-200 to-green-400 mb-1">
              Mena BI
            </h1>
            <div className="flex items-center justify-center gap-2 my-3">
              <div className="h-px w-10 bg-green-400/30" />
              <div className="h-1 w-1 rounded-full bg-green-400/60" />
              <div className="h-px w-10 bg-green-400/30" />
            </div>
            <p className="text-[13px] font-medium text-white/50 tracking-wide">
              Business Intelligence Platform
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-[11px] text-red-300 text-center leading-relaxed">
              {error === "AccessDenied"
                ? "บัญชีนี้ไม่ได้รับอนุญาต — ใช้อีเมล @menatransport.co.th เท่านั้น"
                : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง"}
            </div>
          )}

          {/* Google sign-in */}
          <button
            onClick={() => signIn("google", { callbackUrl })}
            className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-semibold text-gray-700 hover:bg-white/90 active:scale-[0.98] transition-all shadow-lg shadow-black/20"
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
              <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" fill="#FBBC05" />
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </button>

          {/* Domain note */}
          <p className="mt-5 text-center text-[11px] text-white/35 tracking-wide">
            @menatransport.co.th{" "}
            <span className="text-red-400/70 font-semibold">only</span>
          </p>
        </div>

        {/* Footer */}
        <p className="mt-5 text-center text-[10px] text-white/25 tracking-widest uppercase">
          Mena Transport · Internal Platform
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
