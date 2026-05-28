'use client'

import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { useLanguage } from '@/app/providers'
import { content } from '@/lib/translations'
import { motion } from 'framer-motion'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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

export default function ShowcasePage() {
  const { language } = useLanguage()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const t = content[language]

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0]">
      <ShaderBackground />
      
      <div className="relative z-10">
        <Navigation />

        {/* CTA Section */}
        <section className="px-5 sm:px-8 lg:px-12 py-20 sm:py-32 max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold" style={{ fontFamily: 'var(--font-sora)' }}>
              {t.showcase.readyToStart}
            </h2>

            <motion.button
              onClick={() => router.push('/record')}
              whileHover={{ scale: 1.05, boxShadow: '0 20px 50px rgba(232, 96, 26, 0.3)' }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex items-center gap-3 px-8 sm:px-10 py-4 bg-[#E8601A] hover:bg-[#C94E12] text-white font-semibold rounded-full transition-all shadow-lg cursor-pointer"
            >
              <span className="text-base sm:text-lg">
                {t.showcase.getInTouch}
              </span>
              <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </motion.button>
          </motion.div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[#E4E1DA] dark:border-white/10 py-12 sm:py-16 px-5 sm:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto text-center text-sm text-[#6B6560] dark:text-[#9E9890]">
            <p>© 2024 MAYA. {t.showcase.allRights}</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
