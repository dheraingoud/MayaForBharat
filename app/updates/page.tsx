'use client'

import { useState, useEffect } from 'react'
import { useLanguage } from '@/app/providers'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { content } from '@/lib/translations'
import { motion } from 'framer-motion'
import { CheckCircle2, ArrowUpRight, ChevronLeft, Bell, Code2, Zap, TrendingUp, AlertTriangle, Loader2 } from 'lucide-react'

const EASE_PREMIUM = [0.32, 0.72, 0, 1] as const

interface RealUpdate {
  id: string
  appId: string
  appName: string
  appNameHindi: string
  message: string
  messageHi: string
  type: 'improvement' | 'gate_fail' | 'observation'
  filesModified: string[]
  createdAt: string
}

const TYPE_CONFIG = {
  improvement: {
    icon: CheckCircle2,
    color: 'text-[#2D7A4F]',
    bg: 'bg-[#2D7A4F]/10',
    labelEn: 'Improvement',
    labelHi: 'सुधार',
  },
  gate_fail: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    labelEn: 'Gate Failed',
    labelHi: 'गेट विफल',
  },
  observation: {
    icon: TrendingUp,
    color: 'text-[#E8601A]',
    bg: 'bg-[#E8601A]/10',
    labelEn: 'Observation',
    labelHi: 'अवलोकन',
  },
}

function timeAgo(dateStr: string, lang: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return lang === 'hi' ? 'अभी' : 'Just now'
  if (diffMin < 60) return lang === 'hi' ? `${diffMin} मिनट पहले` : `${diffMin}m ago`
  if (diffHr < 24) return lang === 'hi' ? `${diffHr} घंटे पहले` : `${diffHr}h ago`
  if (diffDay < 7) return lang === 'hi' ? `${diffDay} दिन पहले` : `${diffDay}d ago`
  return new Date(dateStr).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'short', day: 'numeric' })
}

export default function Updates() {
  const { language } = useLanguage()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [updates, setUpdates] = useState<RealUpdate[]>([])
  const [loading, setLoading] = useState(true)

  const t = content[language]

  useEffect(() => {
    setMounted(true)
    fetch('/api/updates')
      .then(r => r.json())
      .then(d => {
        setUpdates(d.updates || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (!mounted) return null

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.15 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_PREMIUM } },
  }

  return (
    <div className="relative min-h-[100dvh] bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden">
      <ShaderBackground />

      <div className="relative z-10">
        <Navigation />

        <main className="max-w-2xl mx-auto px-5 sm:px-8 py-8 sm:py-12 pb-24">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_PREMIUM }}
            className="mb-8"
          >
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 text-[#6B6560] dark:text-[#9E9890] hover:text-[#1A1917] dark:hover:text-[#F5F4F0] transition-colors mb-4 text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              {t.updates.back}
            </button>
            <h1
              className="text-2xl sm:text-3xl font-bold"
              style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
            >
              {t.updates.title}
            </h1>
            <p className="text-sm text-[#6B6560] dark:text-[#9E9890] mt-1">
              {loading
                ? (language === 'hi' ? 'लोड हो रहा है...' : 'Loading...')
                : updates.length > 0
                  ? (language === 'hi' ? `${updates.length} अपडेट` : `${updates.length} update${updates.length !== 1 ? 's' : ''}`)
                  : (language === 'hi' ? 'कोई अपडेट नहीं' : 'No updates yet')}
            </p>
          </motion.div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-[#E8601A]" />
            </div>
          )}

          {/* Empty State */}
          {!loading && updates.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#FDF0E8] dark:bg-[#E8601A]/15 flex items-center justify-center mb-4">
                <Bell className="w-7 h-7 text-[#E8601A]" strokeWidth={1.5} />
              </div>
              <h3
                className="text-lg font-bold mb-2"
                style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
              >
                {language === 'hi' ? 'अभी कोई अपडेट नहीं' : 'No Updates Yet'}
              </h3>
              <p className="text-sm text-[#6B6560] dark:text-[#9E9890] max-w-sm">
                {language === 'hi'
                  ? 'जब MAYA आपके ऐप में सुधार करेगा, तो अपडेट यहां दिखेंगे।'
                  : 'Updates will appear here when MAYA improves your apps.'}
              </p>
            </motion.div>
          )}

          {/* Updates List */}
          {!loading && updates.length > 0 && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-3"
            >
              {updates.map((update) => {
                const config = TYPE_CONFIG[update.type] || TYPE_CONFIG.improvement
                const Icon = config.icon

                return (
                  <motion.button
                    key={update.id}
                    variants={itemVariants}
                    onClick={() => router.push(`/workbench/${update.appId}/evolution`)}
                    className="w-full text-left group"
                  >
                    <div className="relative overflow-hidden rounded-2xl border bg-white/80 dark:bg-[#2A2925]/80 backdrop-blur-sm border-[#E4E1DA] dark:border-white/10 p-4 sm:p-5 hover:shadow-lg hover:shadow-[#E8601A]/5 transition-all duration-300">
                      <div className="flex items-start gap-3.5">
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-5 h-5 ${config.color}`} strokeWidth={1.5} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="font-semibold text-sm">
                                  {language === 'hi' ? update.appNameHindi : update.appName}
                                </h3>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${config.bg} ${config.color} font-medium`}>
                                  {language === 'hi' ? config.labelHi : config.labelEn}
                                </span>
                              </div>
                              <p className="text-xs sm:text-sm text-[#6B6560] dark:text-[#9E9890] leading-relaxed group-hover:text-[#1A1917] dark:group-hover:text-[#F5F4F0] transition-colors">
                                {language === 'hi' ? update.messageHi : update.message}
                              </p>
                            </div>
                          </div>

                          {/* Files modified */}
                          {update.filesModified.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {update.filesModified.slice(0, 3).map((f, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 bg-[#F5F4F0] dark:bg-[#1A1917] text-[#6B6560] rounded font-mono">
                                  {f.split('/').pop()}
                                </span>
                              ))}
                              {update.filesModified.length > 3 && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-[#F5F4F0] dark:bg-[#1A1917] text-[#9E9890] rounded">
                                  +{update.filesModified.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Footer */}
                          <div className="flex items-center justify-between mt-2.5">
                            <span className="text-[10px] text-[#9E9890] dark:text-[#6B6560]">
                              {timeAgo(update.createdAt, language)}
                            </span>
                            <div className="inline-flex items-center gap-1 text-[#E8601A] text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                              {t.updates.view}
                              <ArrowUpRight className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </motion.div>
          )}

          {/* Bottom CTA */}
          {!loading && updates.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5, ease: EASE_PREMIUM }}
              className="mt-12 text-center"
            >
              <button
                onClick={() => router.push('/dashboard')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-full font-semibold text-sm transition-colors shadow-lg cursor-pointer"
              >
                {t.updates.viewAllApps}
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  )
}
