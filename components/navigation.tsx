'use client'

import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { useLanguage } from '@/app/providers'
import { content } from '@/lib/translations'
import { useRouter } from 'next/navigation'
import { Sun, Moon } from 'lucide-react'
import { useState, useEffect } from 'react'

export function Navigation() {
  const { language, setLanguage } = useLanguage()
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const t = content[language]

  const navItems = [
    { label: t.nav.features, href: '#features' },
    { label: t.nav.examples, href: '#examples' },
    { label: t.nav.docs, href: '#docs' },
  ]

  if (!mounted) return null

  return (
    <>
      {/* Floating Island Navbar */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-4xl"
      >
        <div className="bg-white/80 dark:bg-[#2A2925]/80 backdrop-blur-xl rounded-full border border-white/20 dark:border-white/10 shadow-2xl">
          <div className="flex items-center justify-between px-6 py-3 sm:px-8">
            {/* Logo */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="cursor-pointer"
              onClick={() => router.push('/')}
            >
              <span
                className="text-base sm:text-lg font-bold text-[#1A1917] dark:text-white tracking-wider"
                style={{ fontFamily: 'var(--font-sora)' }}
              >
                MAYA
              </span>
            </motion.div>

            {/* Center Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {navItems.map((item) => (
                <motion.a
                  key={item.label}
                  href={item.href}
                  whileHover={{ color: '#E8601A' }}
                  className="text-sm text-[#6B6560] dark:text-[#9E9890] font-medium transition-colors"
                >
                  {item.label}
                </motion.a>
              ))}
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Language Toggle */}
              <motion.div
                className="flex items-center gap-2 bg-[#F5F4F0] dark:bg-[#1A1917] rounded-full p-1"
                whileHover={{ scale: 1.02 }}
              >
                {(['hi', 'en'] as const).map((lang) => (
                  <motion.button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                      language === lang
                        ? 'bg-white dark:bg-[#2A2925] text-[#E8601A] shadow-md'
                        : 'text-[#6B6560] dark:text-[#9E9890] hover:text-[#1A1917] dark:hover:text-white'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {lang === 'hi' ? 'हिंदी' : 'English'}
                  </motion.button>
                ))}
              </motion.div>

              {/* Theme Toggle */}
              <motion.button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-2 sm:p-2.5 rounded-full bg-[#F5F4F0] dark:bg-[#2A2925] text-[#1A1917] dark:text-white hover:bg-white dark:hover:bg-white/10 transition-all"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </motion.button>

              {/* CTA Button */}
              <motion.button
                onClick={() => router.push('/sign-in')}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="hidden sm:block px-5 sm:px-6 py-2 bg-[#E8601A] hover:bg-[#C94E12] text-white text-sm font-semibold rounded-full transition-colors shadow-lg hover:shadow-xl cursor-pointer"
              >
                {t.nav.getStarted}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile spacer */}
      <div className="h-20" />
    </>
  )
}
