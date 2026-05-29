'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLanguage } from '@/app/providers'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, CheckCircle2, XCircle, Clock, Zap, Shield, TrendingUp } from 'lucide-react'

interface EvolutionEntry {
  id: string
  status: 'pending' | 'merged' | 'discarded'
  title: string
  description: string
  timestamp: string
  category?: string
  filesModified?: string[]
  gateFailure?: string
  testsPassed?: number
}

interface EvolutionData {
  app: { id: string; name: string; nameHindi: string; category: string }
  entries: EvolutionEntry[]
  stats: { total: number; applied: number; pending: number; discarded: number }
  semanticFacts: number
}

export default function AppEvolutionPage() {
  const params = useParams()
  const router = useRouter()
  const { language } = useLanguage()
  const appId = params.id as string

  const [mounted, setMounted] = useState(false)
  const [data, setData] = useState<EvolutionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
    fetch(`/api/evolution-log?appId=${appId}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [appId])

  const handleApprove = async (entryId: string) => {
    setApproving(entryId)
    try {
      await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, improvementId: entryId, decision: 'accept' }),
      })
      // Update local state
      setData(prev => prev ? {
        ...prev,
        entries: prev.entries.map(e =>
          e.id === entryId ? { ...e, status: 'merged' as const } : e
        ),
        stats: {
          ...prev.stats,
          pending: prev.stats.pending - 1,
          applied: prev.stats.applied + 1,
        },
      } : prev)
    } catch {}
    setApproving(null)
  }

  const handleReject = async (entryId: string) => {
    try {
      await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, improvementId: entryId, decision: 'reject' }),
      })
      setData(prev => prev ? {
        ...prev,
        entries: prev.entries.map(e =>
          e.id === entryId ? { ...e, status: 'discarded' as const } : e
        ),
        stats: {
          ...prev.stats,
          pending: prev.stats.pending - 1,
          discarded: prev.stats.discarded + 1,
        },
      } : prev)
    } catch {}
  }

  if (!mounted) return null

  const appName = data?.app
    ? (language === 'hi' && data.app.nameHindi ? data.app.nameHindi : data.app.name)
    : ''

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden">
      <ShaderBackground />

      <div className="relative z-10">
        <Navigation />

        <main className="max-w-2xl mx-auto px-5 sm:px-8 py-8">
          {/* Back */}
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push(`/app/${appId}`)}
            className="flex items-center gap-2 text-sm text-[#6B6560] dark:text-[#9E9890] hover:text-[#E8601A] transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            {language === 'hi' ? 'वापस' : 'Back to App'}
          </motion.button>

          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8601A]" />
            </div>
          ) : !data ? (
            <div className="text-center py-20">
              <p className="text-[#9E9890]">{language === 'hi' ? 'डेटा नहीं मिला' : 'No data found'}</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ fontFamily: 'var(--font-sora)' }}>
                  <TrendingUp className="inline w-6 h-6 text-[#E8601A] mr-2" />
                  {language === 'hi' ? `${appName} का विकास` : `${appName} Evolution`}
                </h1>
                <p className="text-sm text-[#6B6560] dark:text-[#9E9890]">
                  {language === 'hi'
                    ? 'MAYA हर रात आपके ऐप को स्वचालित रूप से सुधारता है'
                    : 'MAYA automatically improves your app overnight'}
                </p>
              </motion.div>

              {/* Stats Cards */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-3 gap-3 mb-8"
              >
                {[
                  {
                    label: language === 'hi' ? 'कुल' : 'Total',
                    value: data.stats.total,
                    color: '#E8601A',
                    icon: <Zap className="w-4 h-4" />,
                  },
                  {
                    label: language === 'hi' ? 'लागू' : 'Applied',
                    value: data.stats.applied,
                    color: '#2D7A4F',
                    icon: <CheckCircle2 className="w-4 h-4" />,
                  },
                  {
                    label: language === 'hi' ? 'लंबित' : 'Pending',
                    value: data.stats.pending,
                    color: '#F59E0B',
                    icon: <Clock className="w-4 h-4" />,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="bg-white dark:bg-[#2A2925] rounded-2xl border border-[#E4E1DA] dark:border-white/10 p-4 text-center"
                  >
                    <div className="flex items-center justify-center gap-1 mb-1" style={{ color: s.color }}>
                      {s.icon}
                    </div>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs text-[#9E9890]">{s.label}</p>
                  </div>
                ))}
              </motion.div>

              {/* Progress Bar */}
              {data.stats.total > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white dark:bg-[#2A2925] rounded-2xl border border-[#E4E1DA] dark:border-white/10 p-4 mb-8"
                >
                  <div className="w-full bg-[#F5F4F0] dark:bg-[#1A1917] rounded-full h-2 mb-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((data.stats.applied / Math.max(data.stats.total, 1)) * 100)}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="bg-[#2D7A4F] h-2 rounded-full"
                    />
                  </div>
                  <p className="text-xs text-[#9E9890] text-right">
                    {Math.round((data.stats.applied / Math.max(data.stats.total, 1)) * 100)}%{' '}
                    {language === 'hi' ? 'सुधार लागू' : 'improvements live'}
                  </p>
                </motion.div>
              )}

              {/* Timeline */}
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[#E4E1DA] dark:bg-white/10" />

                <div className="space-y-6">
                  <AnimatePresence>
                    {data.entries.map((entry, idx) => (
                      <motion.article
                        key={entry.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.08 }}
                        className="relative pl-10"
                      >
                        {/* Timeline Dot */}
                        <motion.div
                          animate={
                            entry.status === 'pending'
                              ? { boxShadow: ['0 0 0 0 rgba(232, 96, 26, 0.4)', '0 0 0 6px rgba(232, 96, 26, 0)'] }
                              : {}
                          }
                          transition={entry.status === 'pending' ? { duration: 2, repeat: Infinity } : {}}
                          className={`absolute left-[10px] top-6 w-3 h-3 rounded-full border-2 border-white dark:border-[#1A1917] ${
                            entry.status === 'pending'
                              ? 'bg-[#E8601A]'
                              : entry.status === 'merged'
                              ? 'bg-[#2D7A4F]'
                              : 'bg-[#9CA3AF]'
                          }`}
                        />

                        {/* Card */}
                        <div
                          className={`rounded-2xl p-5 border transition-all ${
                            entry.status === 'pending'
                              ? 'bg-[#FDF0E8] dark:bg-[#2A2925] border-[#E8601A]/30'
                              : 'bg-white dark:bg-[#2A2925] border-[#E4E1DA] dark:border-white/10'
                          } ${entry.status === 'discarded' ? 'opacity-60' : ''}`}
                        >
                          {/* Status Badge */}
                          <div className="flex items-center gap-2 mb-2">
                            {entry.status === 'pending' && <Clock className="w-3.5 h-3.5 text-[#E8601A]" />}
                            {entry.status === 'merged' && <CheckCircle2 className="w-3.5 h-3.5 text-[#2D7A4F]" />}
                            {entry.status === 'discarded' && <XCircle className="w-3.5 h-3.5 text-[#9CA3AF]" />}
                            <span className={`text-xs font-semibold uppercase tracking-wider ${
                              entry.status === 'pending' ? 'text-[#E8601A]'
                              : entry.status === 'merged' ? 'text-[#2D7A4F]'
                              : 'text-[#9CA3AF]'
                            }`}>
                              {entry.status === 'pending'
                                ? (language === 'hi' ? 'अनुमोदन लंबित' : 'Pending Approval')
                                : entry.status === 'merged'
                                ? (language === 'hi' ? 'लागू' : 'Applied')
                                : (language === 'hi' ? 'रद्द' : 'Discarded')}
                            </span>
                          </div>

                          <h3
                            className={`font-bold mb-1 ${entry.status === 'discarded' ? 'line-through text-[#9E9890]' : ''}`}
                            style={{ fontFamily: 'var(--font-sora)' }}
                          >
                            {entry.title}
                          </h3>

                          <p className="text-sm text-[#6B6560] dark:text-[#9E9890] mb-3">{entry.description}</p>

                          {/* Category badge */}
                          {entry.category && (
                            <span className="inline-block text-xs bg-[#F5F4F0] dark:bg-[#1A1917] text-[#6B6560] px-2 py-1 rounded-full mb-3">
                              {entry.category}
                            </span>
                          )}

                          {/* Timestamp */}
                          <p className="text-xs text-[#9E9890] mb-3">
                            {new Date(entry.timestamp).toLocaleString(language === 'hi' ? 'hi-IN' : 'en-IN')}
                          </p>

                          {/* Gate failure info */}
                          {entry.gateFailure && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-3">
                              <div className="flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5 text-red-500" />
                                <span className="text-xs text-red-600 dark:text-red-400 font-semibold">
                                  Gate: {entry.gateFailure}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Tests passed */}
                          {entry.testsPassed && entry.testsPassed > 0 && (
                            <p className="text-xs text-[#2D7A4F] flex items-center gap-1 mb-3">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {entry.testsPassed} {language === 'hi' ? 'सुधार मर्ज किए' : 'improvements merged'}
                            </p>
                          )}

                          {/* Actions for pending */}
                          {entry.status === 'pending' && (
                            <div className="flex gap-2 mt-2">
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleApprove(entry.id)}
                                disabled={approving === entry.id}
                                className="flex-1 bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-xl py-2.5 text-xs font-semibold transition-colors disabled:opacity-60"
                              >
                                {approving === entry.id
                                  ? (language === 'hi' ? 'लागू कर रहे हैं...' : 'Applying...')
                                  : (language === 'hi' ? '✅ स्वीकार करें' : '✅ Approve')}
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleReject(entry.id)}
                                className="px-4 py-2.5 border border-[#E4E1DA] dark:border-white/10 rounded-xl text-xs font-semibold hover:bg-[#F5F4F0] dark:hover:bg-white/5 transition-colors"
                              >
                                {language === 'hi' ? '❌ रद्द' : '❌ Reject'}
                              </motion.button>
                            </div>
                          )}
                        </div>
                      </motion.article>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
