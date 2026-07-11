'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[MAYA Error]', error)
  }, [error])

  return (
    <div className="min-h-[100dvh] bg-[#F5F4F0] dark:bg-[#1A1917] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center"
      >
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-500" strokeWidth={1.5} />
        </div>

        <h1
          className="text-2xl font-bold text-[#1A1917] dark:text-[#F5F4F0] mb-2"
          style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
        >
          Something went wrong
        </h1>
        <p className="text-sm text-[#6B6560] dark:text-[#9E9890] mb-8 leading-relaxed">
          MAYA encountered an unexpected error. This has been logged and we&apos;re looking into it.
        </p>

        {error.digest && (
          <p className="text-xs text-[#9E9890] dark:text-[#6B6560] mb-6 font-mono">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={reset}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#E8601A] text-white font-semibold text-sm shadow-lg shadow-[#E8601A]/20 hover:bg-[#C94E12] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </motion.button>

          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[#E4E1DA] dark:border-white/10 bg-white/50 dark:bg-white/5 font-semibold text-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
