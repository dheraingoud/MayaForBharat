'use client'

// Workbench page — unified builder with bolt.diy engine
// For new apps (no appId) — same layout as /workbench/[id] but fresh state

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

// Dynamic import — WebContainer requires browser-only APIs (no SSR)
const BuilderPage = dynamic(
  () => import('@/lib/workbench/components/workbench/BuilderPage').then((m) => ({ default: m.BuilderPage })),
  { ssr: false }
)

// Loading fallback — matches the builder page dark theme
function WorkbenchSkeleton() {
  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-[100vw] min-w-0 isolate bg-[#111110]">
      {/* Skeleton header */}
      <div className="h-11 flex items-center px-3 border-b border-white/[0.06] bg-[#1A1917] shrink-0">
        <div className="w-[70px] h-5 rounded bg-white/[0.05] animate-pulse" />
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          {[1,2,3].map(i => (
            <div key={i} className="w-7 h-7 rounded-md bg-white/[0.05] animate-pulse" />
          ))}
        </div>
        <div className="flex-1" />
        <div className="w-20 h-5 rounded bg-white/[0.05] animate-pulse" />
      </div>
      {/* Skeleton body */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-9 h-9">
            <div className="absolute inset-0 border-2 border-[#E8601A]/15 rounded-full" />
            <div className="absolute inset-0 border-2 border-[#E8601A] rounded-full border-t-transparent animate-spin" />
          </div>
          <p className="text-[11px] text-[#3A3835]">Loading workbench...</p>
        </div>
      </div>
    </div>
  )
}

export default function WorkbenchPage() {
  return (
    <Suspense fallback={<WorkbenchSkeleton />}>
      <BuilderPage />
    </Suspense>
  )
}
