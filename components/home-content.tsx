// @ts-nocheck
'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { useLanguage } from '@/app/providers'
import { content } from '@/lib/translations'
import { useEffect, useState } from 'react'
import { ArrowUpRight, Mic, Zap, RefreshCw, Shield, Globe, Sparkles } from 'lucide-react'
import { ScrollReveal } from '@/components/ui/scroll-reveal'
import { BezelCard } from '@/components/ui/double-bezel'

// ─── Animation Constants ─────────────────────────────────────────────────────

const EASE_PREMIUM = [0.32, 0.72, 0, 1] as const

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.08, delayChildren: 0.3 },
  },
}

const fadeInUp = {
  initial: { opacity: 0, y: 24 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE_PREMIUM },
  },
}

// ─── Feature Icons (clean SVG, no emoji) ──────────────────────────────────────

const featureIcons = [
  <Mic key="mic" className="w-6 h-6 text-[#E8601A]" strokeWidth={1.5} />,
  <Zap key="zap" className="w-6 h-6 text-[#E8601A]" strokeWidth={1.5} />,
  <RefreshCw key="refresh" className="w-6 h-6 text-[#E8601A]" strokeWidth={1.5} />,
]

// ─── Component ───────────────────────────────────────────────────────────────

export function HomeContent() {
  const { language } = useLanguage()
  const router = useRouter()
  const [hasApps, setHasApps] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        if (d.apps && d.apps.length > 0) {
          setHasApps(true)
          router.push('/dashboard')
        }
      })
      .catch(() => {})
  }, [router])

  const t = content[language]

  if (!mounted) return null

  const handleGetStarted = () => {
    router.push(hasApps ? '/dashboard' : '/sign-in')
  }

  return (
    <div className="relative min-h-[100dvh] bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden selection:bg-[#E8601A]/20 selection:text-inherit">
      {/* Shader Background */}
      <ShaderBackground />

      {/* Content Layer */}
      <div className="relative z-10">
        <Navigation hideCta={hasApps} />

        {/* ── Hero Section — Asymmetric Split ──────────────────────────── */}
        <main className="min-h-[calc(100dvh-80px)] flex items-center px-5 sm:px-8 lg:px-12 py-12 sm:py-20">
          <div className="max-w-7xl mx-auto w-full">
            <div className="grid lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-16 items-center">
              {/* ── Left: Content ─────────────────────────────────── */}
              <motion.div
                initial="initial"
                animate="animate"
                variants={staggerContainer}
              >
                {/* Eyebrow Tag */}
                <motion.div variants={fadeInUp} className="mb-6 sm:mb-8">
                  <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[10px] sm:text-xs uppercase tracking-[0.2em] font-medium bg-[#FDF0E8] dark:bg-[#E8601A]/10 text-[#E8601A] ring-1 ring-[#E8601A]/10">
                    <Sparkles className="w-3 h-3" strokeWidth={2} />
                    {t.hero.label}
                  </span>
                </motion.div>

                {/* Main Headline — NO gradient text (banned by skill) */}
                <motion.h1
                  variants={fadeInUp}
                  className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.05] tracking-[-0.03em] mb-6 sm:mb-8 text-[#1A1917] dark:text-white"
                  style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
                >
                  {t.hero.headline.map((line: string, i: number) => (
                    <span
                      key={i}
                      className={`block ${
                        i === 1 ? 'text-[#E8601A]' : ''
                      }`}
                    >
                      {line}
                    </span>
                  ))}
                </motion.h1>

                {/* Description */}
                <motion.p
                  variants={fadeInUp}
                  className="text-base sm:text-lg lg:text-xl text-[#6B6560] dark:text-[#9E9890] max-w-[42ch] mb-8 sm:mb-10 leading-relaxed"
                >
                  {t.hero.description}
                </motion.p>

                {/* CTA Buttons */}
                <motion.div
                  variants={fadeInUp}
                  className="flex flex-col sm:flex-row gap-3 sm:gap-4"
                >
                  {/* Primary CTA — Button-in-Button pattern */}
                  <motion.button
                    onClick={handleGetStarted}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="group relative px-7 sm:px-8 py-3 sm:py-3.5 bg-[#E8601A] hover:bg-[#C94E12] text-white font-semibold rounded-full flex items-center justify-center gap-3 shadow-lg hover:shadow-xl hover:shadow-[#E8601A]/20 cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
                  >
                    <span>{hasApps ? 'Dashboard' : t.hero.cta}</span>
                    {/* Nested trailing icon */}
                    <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center group-hover:translate-x-0.5 group-hover:-translate-y-[1px] group-hover:scale-105 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
                      <ArrowUpRight className="w-3.5 h-3.5 text-white" strokeWidth={2} />
                    </span>
                  </motion.button>

                  {/* Secondary CTA */}
                  <motion.button
                    onClick={handleGetStarted}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="px-7 sm:px-8 py-3 sm:py-3.5 ring-1 ring-[#E4E1DA] dark:ring-white/15 text-[#1A1917] dark:text-white rounded-full font-semibold hover:bg-white/50 dark:hover:bg-white/5 cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
                  >
                    {t.hero.secondary}
                  </motion.button>
                </motion.div>

                {/* Trust Indicators */}
                <motion.div
                  variants={fadeInUp}
                  className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-10 sm:pt-12 mt-10 sm:mt-12 border-t border-[#E4E1DA]/60 dark:border-white/8"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Shield className="w-4 h-4 text-[#2D7A4F] flex-shrink-0" strokeWidth={1.5} />
                    <span className="font-medium text-[#1A1917] dark:text-white">{t.hero.trust.privacy}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#6B6560] dark:text-[#9E9890]">
                    <Globe className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                    <span>{t.hero.trust.languages}</span>
                  </div>
                  <div className="text-sm text-[#6B6560] dark:text-[#9E9890]">
                    {t.hero.trust.users}
                  </div>
                </motion.div>
              </motion.div>

              {/* ── Right: Visual Panel ───────────────────────────── */}
              <motion.div
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.4, ease: EASE_PREMIUM }}
                className="hidden lg:block"
              >
                <div className="relative">
                  {/* Ambient glow */}
                  <div className="absolute -inset-8 bg-gradient-to-br from-[#E8601A]/8 via-transparent to-[#E8601A]/4 rounded-[3rem] blur-2xl" />
                  
                  {/* Mock app preview card */}
                  <BezelCard className="relative overflow-hidden">
                    <div className="p-1">
                      {/* Browser chrome */}
                      <div className="flex items-center gap-2 px-4 py-3 bg-[#F5F4F0] dark:bg-[#1A1917] rounded-t-[calc(2rem-4px)]">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full bg-[#E4E1DA] dark:bg-[#3A3530]" />
                          <div className="w-2.5 h-2.5 rounded-full bg-[#E4E1DA] dark:bg-[#3A3530]" />
                          <div className="w-2.5 h-2.5 rounded-full bg-[#E4E1DA] dark:bg-[#3A3530]" />
                        </div>
                        <div className="flex-1 mx-4">
                          <div className="h-6 bg-white dark:bg-[#2A2925] rounded-lg ring-1 ring-black/5 dark:ring-white/10 flex items-center px-3">
                            <span className="text-[10px] text-[#9E9890]">maya-app.vercel.app</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* App content preview */}
                      <div className="aspect-[4/3] bg-gradient-to-br from-[#FDF0E8] to-white dark:from-[#2A2925] dark:to-[#1A1917] rounded-b-[calc(2rem-4px)] flex items-center justify-center overflow-hidden">
                        <div className="text-center space-y-4 p-8">
                          {/* Floating elements animation */}
                          <motion.div
                            animate={{ y: [0, -8, 0] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            className="w-16 h-16 mx-auto rounded-2xl bg-[#E8601A]/10 flex items-center justify-center"
                          >
                            <Mic className="w-8 h-8 text-[#E8601A]" strokeWidth={1.5} />
                          </motion.div>
                          <div className="space-y-2">
                            <div className="h-3 w-32 mx-auto bg-[#E4E1DA] dark:bg-[#3A3530] rounded-full" />
                            <div className="h-2.5 w-24 mx-auto bg-[#E4E1DA]/60 dark:bg-[#3A3530]/60 rounded-full" />
                          </div>
                          {/* Animated waveform dots */}
                          <div className="flex items-center justify-center gap-1 pt-2">
                            {[0, 1, 2, 3, 4].map((i) => (
                              <motion.div
                                key={i}
                                animate={{ scaleY: [1, 2.5, 1] }}
                                transition={{
                                  duration: 0.6,
                                  delay: i * 0.1,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                }}
                                className="w-1 h-3 bg-[#E8601A]/40 rounded-full origin-center"
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </BezelCard>
                </div>
              </motion.div>
            </div>
          </div>
        </main>

        {/* ── Features Section — Zig-Zag Layout (no 3-equal-column) ───── */}
        <section id="features" className="py-24 sm:py-32 lg:py-40 px-5 sm:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <ScrollReveal>
              <div className="mb-16 sm:mb-20 max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium bg-[#FDF0E8] dark:bg-[#E8601A]/10 text-[#E8601A] ring-1 ring-[#E8601A]/10 mb-6">
                  {language === 'hi' ? 'कैसे काम करता है' : 'How it works'}
                </span>
                <h2
                  className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 text-[#1A1917] dark:text-white tracking-tight"
                  style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
                >
                  {t.features.title}
                </h2>
                <p className="text-base sm:text-lg text-[#6B6560] dark:text-[#9E9890] leading-relaxed">
                  {t.features.subtitle}
                </p>
              </div>
            </ScrollReveal>

            {/* Zig-zag feature layout — alternating 2fr/1fr and 1fr/2fr */}
            <div className="space-y-5 sm:space-y-6">
              {t.features.items.map((item: { title: string; description: string }, idx: number) => (
                <ScrollReveal key={idx} delay={idx * 60}>
                  <BezelCard
                    hoverable
                    className={`overflow-hidden ${
                      idx === 0
                        ? 'lg:col-span-2'
                        : ''
                    }`}
                  >
                    <div className={`flex flex-col ${
                      idx % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                    } items-stretch`}>
                      {/* Icon panel */}
                      <div className="flex-shrink-0 w-full md:w-48 lg:w-64 bg-gradient-to-br from-[#FDF0E8] to-[#FDF0E8]/40 dark:from-[#E8601A]/10 dark:to-[#E8601A]/5 flex items-center justify-center py-10 md:py-0">
                        <div className="w-14 h-14 rounded-2xl bg-white dark:bg-[#2A2925] shadow-sm flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                          {featureIcons[idx]}
                        </div>
                      </div>
                      {/* Content */}
                      <div className="flex-1 p-6 sm:p-8 lg:p-10">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#E8601A]">
                            {language === 'hi' ? `चरण ${idx + 1}` : `Step ${idx + 1}`}
                          </span>
                        </div>
                        <h3
                          className="text-xl sm:text-2xl font-bold mb-3 text-[#1A1917] dark:text-white"
                          style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
                        >
                          {item.title}
                        </h3>
                        <p className="text-sm sm:text-base text-[#6B6560] dark:text-[#9E9890] leading-relaxed max-w-[50ch]">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </BezelCard>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA Footer Section ──────────────────────────────────────── */}
        <section className="py-24 sm:py-32 lg:py-40 px-5 sm:px-8 lg:px-12">
          <ScrollReveal>
            <div className="max-w-3xl mx-auto text-center">
              <h2
                className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 sm:mb-8 text-[#1A1917] dark:text-white tracking-tight"
                style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
              >
                {t.cta.start}
              </h2>
              <p className="text-base sm:text-lg text-[#6B6560] dark:text-[#9E9890] mb-10 sm:mb-12 max-w-[50ch] mx-auto">
                {t.cta.subtext}
              </p>

              <motion.button
                onClick={handleGetStarted}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="group inline-flex items-center gap-3 px-8 sm:px-10 py-4 sm:py-4.5 bg-[#E8601A] hover:bg-[#C94E12] text-white font-semibold rounded-full shadow-lg hover:shadow-xl hover:shadow-[#E8601A]/20 cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              >
                <span className="text-base sm:text-lg">{t.cta.button}</span>
                <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center group-hover:translate-x-0.5 group-hover:-translate-y-[1px] group-hover:scale-105 transition-transform duration-300">
                  <ArrowUpRight className="w-4 h-4 text-white" strokeWidth={2} />
                </span>
              </motion.button>
            </div>
          </ScrollReveal>
        </section>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <footer className="border-t border-[#E4E1DA]/60 dark:border-white/8 py-16 sm:py-20 px-5 sm:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-6 sm:gap-8">
              <div
                className="text-lg font-bold tracking-[0.08em]"
                style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
              >
                MAYA
              </div>
              <p className="text-sm text-[#6B6560] dark:text-[#9E9890]">
                {language === 'hi' ? 'मेकर्स के लिए बनाया गया। दुनिया भर में उपलब्ध।' : 'Built for makers. Available globally.'}
              </p>
              <div className="text-xs sm:text-sm text-[#9E9890] dark:text-[#6B6560]">
                © 2026 MAYA. All rights reserved.
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
