import { Metadata } from 'next'
import Link from 'next/link'
import { Home, Search } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Page Not Found — MAYA',
}

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-[#F5F4F0] dark:bg-[#1A1917] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-[#FDF0E8] dark:bg-[#E8601A]/15 flex items-center justify-center">
          <Search className="w-8 h-8 text-[#E8601A]" strokeWidth={1.5} />
        </div>

        <h1
          className="text-6xl font-bold text-[#E8601A] mb-2"
          style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
        >
          404
        </h1>
        <h2
          className="text-xl font-bold text-[#1A1917] dark:text-[#F5F4F0] mb-2"
          style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
        >
          Page not found
        </h2>
        <p className="text-sm text-[#6B6560] dark:text-[#9E9890] mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#E8601A] text-white font-semibold text-sm shadow-lg shadow-[#E8601A]/20 hover:bg-[#C94E12] transition-colors"
        >
          <Home className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
