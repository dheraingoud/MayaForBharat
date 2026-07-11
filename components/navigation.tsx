'use client'

import { motion } from 'framer-motion'
import { useLanguage } from '@/app/providers'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/nextjs'

// ─── Animation Constants ─────────────────────────────────────────────────────

const EASE_PREMIUM = [0.32, 0.72, 0, 1] as const

const navVariants = {
  hidden: { y: -20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { duration: 0.6, delay: 0.2, ease: EASE_PREMIUM },
  },
}

// ─── Navigation Component ────────────────────────────────────────────────────

export function Navigation() {
  const { language, setLanguage } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  // Clerk auth — graceful degradation
  const hasClerk =
    !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_test_disable')

  const { isLoaded, isSignedIn } = useAuth()

  // Only show on landing page
  const isLander = pathname === '/'

  useEffect(() => {
    setMounted(true)
  }, [])

  // Don't render on non-landing pages or before mount
  if (!mounted || !isLander) return null

  return (
    <>
      {/* ── Floating Island Navbar ───────────────────────────────────── */}
      <motion.nav
        variants={navVariants}
        initial="hidden"
        animate="visible"
        className="fixed top-6 left-1/2 -translate-x-1/2 z-[var(--z-nav)] w-fit"
      >
        {/* Outer shell — glassmorphic pill */}
        <div className="bg-white/80 dark:bg-[#2A2925]/80 backdrop-blur-xl rounded-full ring-1 ring-black/5 dark:ring-white/[0.08] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-4 sm:gap-6 py-2.5 px-4 sm:px-6">

            {/* ── Logo ──────────────────────────────────────────────── */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="cursor-pointer select-none"
              onClick={() => router.push('/')}
            >
              <span
                className="text-base sm:text-lg font-bold text-[#1A1917] dark:text-white tracking-[0.08em]"
                style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
              >
                MAYA
              </span>
            </motion.div>

            {/* ── Divider ───────────────────────────────────────────── */}
            <div className="w-px h-5 bg-[#E4E1DA] dark:bg-white/10" />

            {/* ── Dashboard Link ─────────────────────────────────────── */}
            <motion.button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-[#6B6560] dark:text-[#9E9890] font-medium transition-colors duration-300 hover:text-[#E8601A]"
              whileHover={{ y: -1 }}
            >
              Dashboard
            </motion.button>

            {/* ── Divider ───────────────────────────────────────────── */}
            <div className="w-px h-5 bg-[#E4E1DA] dark:bg-white/10" />

            {/* ── Language Toggle ─────────────────────────────────────── */}
            <div className="flex items-center bg-[#F5F4F0] dark:bg-[#1A1917] rounded-full p-0.5">
              {(['hi', 'en'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    language === lang
                      ? 'bg-white dark:bg-[#2A2925] text-[#E8601A] shadow-sm'
                      : 'text-[#6B6560] dark:text-[#9E9890] hover:text-[#1A1917] dark:hover:text-white'
                  }`}
                >
                  {lang === 'hi' ? 'हिंदी' : 'EN'}
                </button>
              ))}
            </div>

            {/* ── User Avatar / Sign In ───────────────────────────────── */}
            {isLoaded && isSignedIn && (
              <div className="flex items-center">
                <UserButton
                  appearance={{
                    elements: {
                      userButtonAvatarBox:
                        'w-7 h-7 sm:w-8 sm:h-8 shadow-sm hover:shadow-md transition-shadow ring-1 ring-black/5',
                    },
                  }}
                />
              </div>
            )}

            {/* Signed out → Sign In button */}
            {isLoaded && !isSignedIn && (
              <motion.button
                onClick={() => router.push('/sign-in')}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#E8601A] hover:bg-[#C94E12] text-white text-xs sm:text-sm font-semibold rounded-full transition-colors duration-300 shadow-md hover:shadow-lg cursor-pointer"
              >
                Sign in
              </motion.button>
            )}
          </div>
        </div>
      </motion.nav>

      {/* Spacer to prevent content from hiding behind fixed nav */}
      <div className="h-20" />
    </>
  )
}
