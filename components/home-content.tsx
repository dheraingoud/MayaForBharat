'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { useLanguage } from '@/app/providers'
import { content } from '@/lib/translations'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { FeatureCard, SpeakIcon, BuildIcon, ImproveIcon } from '@/components/ui-components'
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 },
}

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
}

export function HomeContent() {
  const { language } = useLanguage()
  const { theme } = useTheme()
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
    if (hasApps) {
      router.push('/dashboard')
    } else {
      router.push('/sign-in')
    }
  }

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden selection:bg-[#E8601A] selection:text-white">
      {/* Shader Background */}
      <ShaderBackground />

      {/* Content Layer */}
      <div className="relative z-10">
        <Navigation hideCta={hasApps} />

        {/* Hero Section */}
        <main className="flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-5 sm:px-8 lg:px-12 py-12 sm:py-20">
          <motion.div
            initial="initial"
            animate="animate"
            variants={staggerContainer}
            className="max-w-5xl mx-auto w-full text-center"
          >
            {/* Label */}
            <motion.div variants={fadeInUp} className="mb-6 sm:mb-8">
              <span
                className="text-xs sm:text-sm tracking-[0.2em] text-[#6B6560] dark:text-[#9E9890] uppercase font-semibold"
                style={{ fontFamily: 'var(--font-sora)' }}
              >
                {t.hero.label}
              </span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              variants={fadeInUp}
              className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold leading-[1.1] tracking-[-0.02em] mb-6 sm:mb-8"
              style={{ fontFamily: 'var(--font-sora)' }}
            >
              {t.hero.headline.map((line, i) => (
                <motion.span
                  key={i}
                  className={`block ${
                    i === 1 ? 'bg-gradient-to-r from-[#E8601A] to-[#C94E12] bg-clip-text text-transparent' : ''
                  }`}
                  whileInView={{ opacity: [0, 1], y: [20, 0] }}
                  transition={{ duration: 0.7, delay: i * 0.1 }}
                >
                  {line}
                </motion.span>
              ))}
            </motion.h1>

            {/* Description */}
            <motion.p
              variants={fadeInUp}
              className="text-base sm:text-lg lg:text-xl text-[#6B6560] dark:text-[#9E9890] max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed"
            >
              {t.hero.description}
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-12"
            >
              {/* Primary CTA */}
              <motion.button
                onClick={handleGetStarted}
                whileHover={{ scale: 1.02, boxShadow: '0 20px 50px rgba(232, 96, 26, 0.3)' }}
                whileTap={{ scale: 0.95 }}
                className="group relative px-8 sm:px-10 py-3 sm:py-4 bg-[#E8601A] hover:bg-[#C94E12] text-white font-semibold rounded-full flex items-center justify-center gap-3 transition-all duration-300 shadow-lg cursor-pointer"
              >
                <span>{hasApps ? 'Dashboard' : t.hero.cta}</span>
                <motion.div
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/20 flex items-center justify-center"
                  whileHover={{ rotate: -45, scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                </motion.div>
              </motion.button>

              {/* Secondary CTA */}
              <motion.button
                onClick={handleGetStarted}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 sm:px-10 py-3 sm:py-4 border border-[#E4E1DA] dark:border-white/20 text-[#1A1917] dark:text-white rounded-full font-semibold hover:bg-[#F5F4F0] dark:hover:bg-white/5 transition-all duration-300 cursor-pointer"
              >
                {t.hero.secondary}
              </motion.button>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 pt-8 sm:pt-12 border-t border-[#E4E1DA] dark:border-white/10"
            >
              <div className="flex items-center gap-2 text-sm sm:text-base">
                <div className="w-4 h-4 rounded-full bg-[#2D7A4F] flex-shrink-0" />
                <span className="font-semibold">{t.hero.trust.privacy}</span>
              </div>
              <div className="text-sm sm:text-base text-[#6B6560] dark:text-[#9E9890]">{t.hero.trust.users}</div>
              <div className="text-sm sm:text-base text-[#6B6560] dark:text-[#9E9890]">{t.hero.trust.languages}</div>
            </motion.div>
          </motion.div>
        </main>

        {/* Features Section */}
        <section id="features" className="py-20 sm:py-32 lg:py-40 px-5 sm:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center mb-16 sm:mb-20"
            >
              <h2
                className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-[#1A1917] dark:text-white"
                style={{ fontFamily: 'var(--font-sora)' }}
              >
                {t.features.title}
              </h2>
              <p className="text-base sm:text-lg text-[#6B6560] dark:text-[#9E9890]">
                {t.features.subtitle}
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
              {t.features.items.map((item, idx) => {
                const iconComponents = [
                  <SpeakIcon key="speak" />,
                  <BuildIcon key="build" />,
                  <ImproveIcon key="improve" />,
                ]
                return (
                  <FeatureCard
                    key={idx}
                    title={item.title}
                    description={item.description}
                    iconComponent={iconComponents[idx]}
                    index={idx}
                  />
                )
              })}
            </div>
          </div>
        </section>

        {/* CTA Footer Section */}
        <section className="py-20 sm:py-32 lg:py-40 px-5 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto text-center"
          >
            <h2
              className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 sm:mb-8"
              style={{ fontFamily: 'var(--font-sora)' }}
            >
              {t.cta.start}
            </h2>
            <p className="text-base sm:text-lg text-[#6B6560] dark:text-[#9E9890] mb-8 sm:mb-12">
              {t.cta.subtext}
            </p>

            <motion.button
              onClick={handleGetStarted}
              whileHover={{ scale: 1.05, boxShadow: '0 20px 50px rgba(232, 96, 26, 0.3)' }}
              whileTap={{ scale: 0.95 }}
              className="group px-8 sm:px-12 py-4 sm:py-5 bg-[#E8601A] hover:bg-[#C94E12] text-white font-semibold rounded-full flex items-center justify-center gap-3 mx-auto transition-all duration-300 shadow-lg cursor-pointer"
            >
              <span className="text-base sm:text-lg">{t.cta.button}</span>
              <motion.div
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 flex items-center justify-center"
                whileHover={{ rotate: -45, scale: 1.1 }}
              >
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </motion.div>
            </motion.button>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[#E4E1DA] dark:border-white/10 py-12 sm:py-16 px-5 sm:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-6 sm:gap-8">
              <div
                className="text-lg font-bold"
                style={{ fontFamily: 'var(--font-sora)' }}
              >
                MAYA
              </div>
              <p className="text-sm text-[#6B6560] dark:text-[#9E9890]">
                Built for makers. Available globally.
              </p>
              <div className="text-xs sm:text-sm text-[#6B6560] dark:text-[#9E9890]">
                © 2026 MAYA. All rights reserved.
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
