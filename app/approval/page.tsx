'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useLanguage } from '@/app/providers'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { content } from '@/lib/translations'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, X, Zap, Loader2 } from 'lucide-react'

export default function ApprovalPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appId = searchParams.get('appId')
  const { theme } = useTheme()
  const { language } = useLanguage()
  const [mounted, setMounted] = useState(false)
  const [selectedAction, setSelectedAction] = useState<'accept' | 'reject' | null>(null)
  const [pendingImprovements, setPendingImprovements] = useState<any[]>([])
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
          setPendingImprovements(d.pendingImprovements || [])
          setAppName(d.appName || 'App')
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
    if (!appId || pendingImprovements.length === 0 || submitting) return
    setSelectedAction(decision)
    setSubmitting(true)
    
    try {
      await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId,
          improvementId: pendingImprovements[0].id, // take the first one
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

  // Changes list from dynamic improvements
  const changes = pendingImprovements.length > 0 
    ? pendingImprovements.map(imp => ({
        title: imp.title,
        detail: imp.description || imp.category,
      }))
    : [
        { title: 'No pending updates', detail: 'Everything is up to date' }
      ]

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden">
      <ShaderBackground />

      <div className="relative z-10">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-40 backdrop-blur-md bg-white/40 dark:bg-[#1A1917]/40 border-b border-[#E4E1DA] dark:border-white/10"
        >
          <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.back()}
              className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#E4E1DA] dark:hover:bg-white/10 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </motion.button>

            <h1 className="text-lg sm:text-xl font-bold text-[#1A1917] dark:text-white">
              {appName}
            </h1>

            <div className="hidden sm:flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-full bg-[#FDF0E8] dark:bg-[#E8601A]/15 border border-[#E8601A]/20 dark:border-[#E8601A]/30">
              <Zap className="w-4 h-4 text-[#E8601A]" />
              <span className="text-xs sm:text-sm font-semibold text-[#E8601A] uppercase tracking-wider">
                {t.approval.title}
              </span>
            </div>

            <div className="w-10" />
          </div>
        </motion.header>

        <main className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12 flex flex-col gap-6 sm:gap-8 min-h-[calc(100vh-7rem)]">
          {/* Split Screen Comparison */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 flex-1 items-start"
          >
            {/* Left Panel - Current */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col gap-3 h-full"
            >
              <h2 className="text-base sm:text-lg font-bold text-[#6B6560] dark:text-[#9E9890] px-1">
                {t.approval.current}
              </h2>

              <motion.div
                whileHover={{ y: -2 }}
                className="relative group overflow-hidden rounded-2xl sm:rounded-3xl flex-1 min-h-[400px] sm:min-h-[500px] lg:min-h-[550px] bg-[#E4E1DA] dark:bg-[#2A2925] border border-[#E4E1DA] dark:border-white/10 shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-black/20 to-transparent dark:from-black/40 group-hover:from-black/30 dark:group-hover:from-black/50 transition-all duration-300" />
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/20 dark:bg-white/10 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-10 h-10 sm:w-12 sm:h-12 text-[#6B6560] dark:text-[#9E9890]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm sm:text-base text-[#6B6560] dark:text-[#9E9890] font-medium">{t.approval.currentVersion}</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* Right Panel - New */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col gap-3 h-full"
            >
              <div className="flex items-center gap-2 px-1">
                <motion.span
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="flex h-3 w-3"
                >
                  <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-[#E8601A] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[#E8601A]" />
                </motion.span>
                <h2 className="text-base sm:text-lg font-bold text-[#1A1917] dark:text-white">
                  {t.approval.new}
                </h2>
                <span className="ml-auto px-2.5 py-1 bg-[#E8601A] text-white text-xs font-bold rounded-full shadow-lg shadow-[#E8601A]/30">
                  NEW
                </span>
              </div>

              <motion.div
                whileHover={{ y: -4, boxShadow: '0 20px 40px rgba(232, 96, 26, 0.15)' }}
                className="relative group overflow-hidden rounded-2xl sm:rounded-3xl flex-1 min-h-[400px] sm:min-h-[500px] lg:min-h-[550px] bg-gradient-to-br from-[#E8601A] to-[#C94E12] border-2 border-[#E8601A] shadow-[0_8px_32px_rgba(232,96,26,0.2)] dark:shadow-[0_8px_32px_rgba(232,96,26,0.15)] transition-all duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
                <div className="w-full h-full flex items-center justify-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-center"
                  >
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/30 dark:bg-white/20 flex items-center justify-center mx-auto mb-4">
                      <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm sm:text-base text-white font-semibold">{t.approval.improvedVersion}</p>
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          </motion.section>

          {/* What Changed */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/50 dark:bg-white/5 backdrop-blur-md border border-[#E4E1DA] dark:border-white/10 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-lg relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#E8601A]/5 dark:bg-[#E8601A]/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3" />

            <div className="relative z-10 flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-center">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-[#E8601A] shrink-0" />

              <div className="flex flex-col gap-2 flex-1">
                <p className="text-sm sm:text-base text-[#1A1917] dark:text-[#F5F4F0] leading-relaxed font-medium">
                  {changes.map(c => c.title).join(' • ')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="px-2.5 py-1 rounded-full bg-[#FDF0E8] dark:bg-[#E8601A]/15 text-[#E8601A] text-xs font-medium border border-[#E8601A]/20">
                    {pendingImprovements.length > 0 ? pendingImprovements[0].category || t.approval.uiUpdate : t.approval.uiUpdate}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-[#E8601A]/10 dark:bg-[#E8601A]/20 text-[#E8601A] text-xs font-bold border border-[#E8601A]/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E8601A]" />
                    {t.approval.highPriority}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Change Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white/60 dark:bg-white/5 backdrop-blur-md border border-[#E4E1DA] dark:border-white/10 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm"
          >
            <h3 className="text-sm font-semibold text-[#1A1917] dark:text-white mb-3">
              {t.approval.changed}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {changes.map((change, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-[#E8601A]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[#E8601A] text-xs font-bold">{idx + 1}</span>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-[#1A1917] dark:text-[#F5F4F0] font-medium">
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
            transition={{ delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-3 sm:gap-4"
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction('reject')}
              disabled={selectedAction !== null || submitting || loading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl border border-[#E4E1DA] dark:border-white/10 bg-white/50 dark:bg-white/5 hover:bg-white/70 dark:hover:bg-white/10 text-[#1A1917] dark:text-white font-semibold text-sm sm:text-base transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selectedAction === 'reject' ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <X className="w-4 h-4 sm:w-5 sm:h-5" />}
              {t.approval.reject}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02, boxShadow: '0 12px 32px rgba(232, 96, 26, 0.3)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAction('accept')}
              disabled={selectedAction !== null || submitting || loading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl bg-[#E8601A] hover:bg-[#C94E12] text-white font-semibold text-sm sm:text-base transition-all duration-300 shadow-lg shadow-[#E8601A]/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {selectedAction === 'accept' ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Check className="w-4 h-4 sm:w-5 sm:h-5" />}
              {t.approval.accept}
            </motion.button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-xs text-[#6B6560] dark:text-[#9E9890] text-center"
          >
            {t.approval.autoApply}
          </motion.p>
        </main>
      </div>
    </div>
  )
}
