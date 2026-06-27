'use client'

import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { useLanguage } from '@/app/providers'
import { content } from '@/lib/translations'
import { motion } from 'framer-motion'
import { ArrowRight, ExternalLink, Loader2, Sparkles, Globe } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const EASE_PREMIUM = [0.32, 0.72, 0, 1] as const

interface LiveApp {
  id: string
  nameKey: string
  nameHindi: string
  typeKey: string
  url: string
  status: string
  emoji: string
}

export default function ShowcasePage() {
  const { language } = useLanguage()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [apps, setApps] = useState<LiveApp[]>([])
  const [loading, setLoading] = useState(true)

  const t = content[language]

  useEffect(() => {
    setMounted(true)
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        const liveApps = (d.apps || []).filter((a: any) => a.status === 'live' && a.url)
        setApps(liveApps)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (!mounted) return null

  return (
    <div className="relative min-h-[100dvh] bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0]">
      <ShaderBackground />
      
      <div className="relative z-10">
        <Navigation />

        <main className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-12 py-12 sm:py-20">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_PREMIUM }}
            className="text-center mb-12 sm:mb-16"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FDF0E8] dark:bg-[#E8601A]/15 border border-[#E8601A]/20 mb-6">
              <Sparkles className="w-3.5 h-3.5 text-[#E8601A]" />
              <span className="text-xs font-semibold text-[#E8601A] uppercase tracking-wider">
                {language === 'hi' ? 'शोकेस' : 'Showcase'}
              </span>
            </div>
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4"
              style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
            >
              {language === 'hi' ? 'MAYA से बने ऐप्स' : 'Built with MAYA'}
            </h1>
            <p className="text-base sm:text-lg text-[#6B6560] dark:text-[#9E9890] max-w-xl mx-auto">
              {language === 'hi'
                ? 'आवाज से बने हुए असली बिज़नेस ऐप्स। हर ऐप MAYA की AI ने बनाया है।'
                : 'Real business apps built by voice. Every app was created and deployed by MAYA\'s AI.'}
            </p>
          </motion.div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-[#E8601A]" />
            </div>
          )}

          {/* App Grid */}
          {!loading && apps.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, ease: EASE_PREMIUM }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-16"
            >
              {apps.map((app, idx) => (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08, duration: 0.5, ease: EASE_PREMIUM }}
                >
                  <div className="group relative bg-white dark:bg-[#2A2925] rounded-2xl border border-[#E4E1DA] dark:border-white/10 overflow-hidden hover:shadow-xl hover:shadow-[#E8601A]/5 transition-all duration-500">
                    {/* Iframe Preview */}
                    <div className="relative w-full aspect-[4/3] overflow-hidden bg-[#F5F4F0] dark:bg-[#1A1917]">
                      <iframe
                        src={app.url}
                        className="w-full h-full border-0 pointer-events-none"
                        sandbox="allow-scripts allow-same-origin"
                        title={`${app.nameKey} preview`}
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      
                      {/* Hover overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="flex gap-2">
                          <button
                            onClick={() => router.push(`/workbench/${app.id}`)}
                            className="px-3 py-1.5 bg-white/90 dark:bg-black/80 backdrop-blur-sm rounded-lg text-xs font-semibold text-[#1A1917] dark:text-white hover:bg-white shadow-lg transition-all"
                          >
                            {language === 'hi' ? 'विवरण' : 'Details'}
                          </button>
                          <a
                            href={app.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-[#E8601A] rounded-lg text-xs font-semibold text-white hover:bg-[#C94E12] shadow-lg transition-all flex items-center gap-1"
                          >
                            <Globe className="w-3 h-3" />
                            {language === 'hi' ? 'लाइव देखें' : 'Visit'}
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Card Info */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <h3
                          className="font-bold text-sm"
                          style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
                        >
                          {language === 'hi' && app.nameHindi ? app.nameHindi : app.nameKey}
                        </h3>
                        <span className="text-lg">{app.emoji}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5F4F0] dark:bg-[#1A1917] text-[#6B6560] dark:text-[#9E9890] font-medium">
                          {app.typeKey}
                        </span>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#2D7A4F]" />
                          <span className="text-[10px] text-[#2D7A4F] font-medium">
                            {language === 'hi' ? 'लाइव' : 'Live'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          {/* Empty State */}
          {!loading && apps.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#FDF0E8] dark:bg-[#E8601A]/15 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-8 h-8 text-[#E8601A]" strokeWidth={1.5} />
              </div>
              <h3
                className="text-xl font-bold mb-2"
                style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
              >
                {language === 'hi' ? 'अभी कोई लाइव ऐप नहीं' : 'No Live Apps Yet'}
              </h3>
              <p className="text-sm text-[#6B6560] dark:text-[#9E9890] max-w-sm mx-auto mb-8">
                {language === 'hi'
                  ? 'अपना पहला ऐप बनाएं और यहां शोकेस करें।'
                  : 'Create your first app and showcase it here.'}
              </p>
            </motion.div>
          )}

          {/* CTA Section */}
          <section className="text-center py-12 sm:py-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE_PREMIUM }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <h2
                className="text-2xl sm:text-3xl lg:text-4xl font-bold"
                style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
              >
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
        </main>

        <footer className="border-t border-[#E4E1DA] dark:border-white/10 py-12 sm:py-16 px-5 sm:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto text-center text-sm text-[#6B6560] dark:text-[#9E9890]">
            <p>© 2026 MAYA. {t.showcase.allRights}</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
