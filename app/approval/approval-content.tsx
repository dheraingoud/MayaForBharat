'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/app/providers'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { content } from '@/lib/translations'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Check, X, Zap, Loader2, Eye, Shield } from 'lucide-react'

const EASE_PREMIUM = [0.32, 0.72, 0, 1] as const

interface PendingEntry {
  id: string
  title: string
  description: string
  category?: string
  timestamp: string
}

export default function ApprovalContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appId = searchParams.get('appId')
  const { language } = useLanguage()
  const [mounted, setMounted] = useState(false)
  const [selectedAction, setSelectedAction] = useState<'accept' | 'reject' | null>(null)
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [appName, setAppName] = useState('App')
  const [submitting, setSubmitting] = useState(false)

  const t = content[language]

  useEffect(() => {
    setMounted(true)
    if (appId) {
      fetch(`/api/evolution-log?appId=${appId}`)
        .then(r => r.json())
        .then(d => {
          // Fix: read from entries array, filter for pending status
          const pending = (d.entries || []).filter((e: any) => e.status === 'pending')
          setPendingEntries(pending)
          setAppName(d.app?.name || 'App')
          setLoading(false)
        })
        .catch(() => {
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [appId])

  if (!mounted) return null

  const handleAction = async (decision: 'accept' | 'reject') => {
    if (!appId || pendingEntries.length === 0 || submitting) return
    setSelectedAction(decision)
    setSubmitting(true)

    try {
      await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId,
          improvementId: pendingEntries[0].id,
          decision
        })
      })

      router.push('/dashboard')
    } catch (e) {
      console.error(e)
      setSubmitting(false)
      setSelectedAction(null)
    }
  }

  const changes = pendingEntries.length > 0
    ? pendingEntries.map((imp: any) => ({
        title: imp.title,
        detail: imp.description || imp.category || '',
      }))
    : [
        { title: language === 'hi' ? 'कोई अपडेट नहीं' : 'No pending updates', detail: language === 'hi' ? 'सब अपडेट है' : 'Everything is up to date' }
      ]

  return (
    <div className="relative min-h-[100dvh] bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-auto">
      <ShaderBackground />

      <div className="relative z-10">
        <Navigation />

        <main className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12 flex flex-col gap-6 sm:gap-8 min-h-[calc(100dvh-7rem)]">
          {/* Back + Title */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_PREMIUM }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#E4E1DA] dark:hover:bg-white/10 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
              </button>
              <div>
                <h1
                  className="text-lg sm:text-xl font-bold"
                  style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
                >
                  {appName}
                </h1>
                <p className="text-xs text-[#6B6560] dark:text-[#9E9890]">
                  {pendingEntries.length > 0
                    ? (language === 'hi' ? `${pendingEntries.length} सुधार लंबित` : `${pendingEntries.length} improvement${pendingEntries.length > 1 ? 's' : ''} pending`)
                    : (language === 'hi' ? 'कोई लंबित सुधार नहीं' : 'No pending improvements')}
                </p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FDF0E8] dark:bg-[#E8601A]/15 border border-[#E8601A]/20">
              <Zap className="w-4 h-4 text-[#E8601A]" />
              <span className="text-xs font-semibold text-[#E8601A] uppercase tracking-wider">
                {t.approval.title}
              </span>
            </div>
          </motion.div>

          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-8 h-8 animate-spin text-[#E8601A]" />
            </div>
          ) : pendingEntries.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center flex-1 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#FDF0E8] dark:bg-[#E8601A]/15 flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-[#E8601A]" strokeWidth={1.5} />
              </div>
              <h2
                className="text-xl font-bold mb-2"
                style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
              >
                {language === 'hi' ? 'सब अच्छा है!' : 'All Clear!'}
              </h2>
              <p className="text-sm text-[#6B6560] dark:text-[#9E9890] max-w-sm">
                {language === 'hi'
                  ? 'कोई लंबित सुधार नहीं है। MAYA अगली रात और सुधार प्रस्तावित करेगा।'
                  : 'No pending improvements. MAYA will propose more improvements overnight.'}
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="mt-6 flex items-center gap-2 text-[#E8601A] hover:text-[#C94E12] text-sm font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {language === 'hi' ? 'डैशबोर्ड पर वापस जाएं' : 'Back to Dashboard'}
              </button>
            </motion.div>
          ) : (
            <>
              {/* Split Screen: Before/After with real iframes */}
              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, ease: EASE_PREMIUM }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1"
              >
                {/* Before (Current Live) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-1">
                    <Eye className="w-3.5 h-3.5 text-[#6B6560]" />
                    <h2 className="text-sm font-semibold text-[#6B6560] dark:text-[#9E9890]">
                      {language === 'hi' ? 'पहले (लाइव)' : 'Before (Current)'}
                    </h2>
                  </div>
                  <div className="flex-1 min-h-[400px] sm:min-h-[500px] bg-white dark:bg-[#2A2925] rounded-2xl border border-[#E4E1DA] dark:border-white/10 overflow-hidden relative">
                    <iframe
                      src={appId ? `/api/apps/${appId}/preview?v=current` : ''}
                      className="w-full h-full border-0 bg-white absolute inset-0"
                      title="Current version"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                </div>

                {/* After (Proposed) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 px-1">
                    <Eye className="w-3.5 h-3.5 text-[#E8601A]" />
                    <h2 className="text-sm font-semibold text-[#E8601A]">
                      {language === 'hi' ? 'बाद (प्रस्तावित)' : 'After (Proposed)'}
                    </h2>
                    <span className="px-2 py-0.5 bg-[#E8601A] text-white text-[10px] font-bold rounded-full">NEW</span>
                  </div>
                  <div className="flex-1 min-h-[400px] sm:min-h-[500px] bg-white dark:bg-[#2A2925] rounded-2xl border-2 border-[#E8601A]/30 overflow-hidden relative shadow-lg shadow-[#E8601A]/10">
                    <iframe
                      src={appId && pendingEntries[0] ? `/api/apps/${appId}/preview?v=proposed&imp=${pendingEntries[0].id}` : ''}
                      className="w-full h-full border-0 bg-white absolute inset-0"
                      title="Proposed version"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                </div>
              </motion.section>

              {/* What Changed */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, ease: EASE_PREMIUM }}
                className="bg-white/60 dark:bg-white/5 backdrop-blur-md border border-[#E4E1DA] dark:border-white/10 p-4 sm:p-5 rounded-2xl"
              >
                <h3
                  className="text-sm font-semibold mb-3"
                  style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
                >
                  {t.approval.changed}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {changes.map((change: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-[#E8601A]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[#E8601A] text-xs font-bold">{idx + 1}</span>
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-medium">
                          {change.title}
                        </p>
                        <p className="text-xs text-[#6B6560] dark:text-[#9E9890] mt-0.5">
                          {change.detail}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, ease: EASE_PREMIUM }}
                className="flex flex-col sm:flex-row gap-3 sm:gap-4"
              >
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAction('reject')}
                  disabled={selectedAction !== null || submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl border border-[#E4E1DA] dark:border-white/10 bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 font-semibold text-sm transition-all duration-300 disabled:opacity-50"
                >
                  {selectedAction === 'reject' ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />}
                  {t.approval.reject}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: '0 12px 32px rgba(232, 96, 26, 0.3)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAction('accept')}
                  disabled={selectedAction !== null || submitting}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-[#E8601A] hover:bg-[#C94E12] text-white font-semibold text-sm transition-all duration-300 shadow-lg shadow-[#E8601A]/30 disabled:opacity-50"
                >
                  {selectedAction === 'accept' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                  {t.approval.accept}
                </motion.button>
              </motion.div>

              <p className="text-xs text-[#6B6560] dark:text-[#9E9890] text-center">
                {t.approval.autoApply}
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
