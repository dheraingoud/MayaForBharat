// Server component wrapper — keeps `useSearchParams` inside a Suspense boundary.
// Without this split, Next.js 16 fails the static prerender with a workStore invariant.

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import ApprovalContent from './approval-content'

export const dynamic = 'force-dynamic'

export default function ApprovalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] bg-[#F5F4F0] dark:bg-[#1A1917] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#E8601A]" />
        </div>
      }
    >
      <ApprovalContent />
    </Suspense>
  )
}
