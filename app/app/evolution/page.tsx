'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/app/providers'
import { content } from '@/lib/translations'

interface TimelineEntry {
  id: string
  status: 'pending' | 'merged' | 'discarded'
  titleKey: string
  descriptionKey: string
  timestamp: string
  beforeImage?: string
  afterImage?: string
  testsPassed?: number
  failureReason?: string
}

export default function EvolutionPage() {
  const router = useRouter()
  const { language } = useLanguage()
  const t = content[language]

  const entries: TimelineEntry[] = [
    {
      id: '1',
      status: 'pending',
      titleKey: 'entry1_title',
      descriptionKey: 'entry1_desc',
      timestamp: '⏳ ' + t.evolution.approvalNeeded,
    },
    {
      id: '2',
      status: 'merged',
      titleKey: 'entry2_title',
      descriptionKey: 'entry2_desc',
      timestamp: '✓ ' + t.evolution.appliedStatus,
      testsPassed: 12,
    },
    {
      id: '3',
      status: 'discarded',
      titleKey: 'entry3_title',
      descriptionKey: 'entry3_desc',
      timestamp: '↩ ' + t.evolution.discardedStatus,
      failureReason: 'tests_failed',
    },
  ]

  // App-specific name from translations
  const appName = t.apps?.ramKirana?.name || 'Ram Kirana'

  const navItems = [
    { icon: '📊', label: t.evolution.title, active: true, path: '/evolution' },
    { icon: '⚡', label: t.evolution.build, active: false, path: '/record' },
    { icon: '🎤', label: t.evolution.voice, active: false, path: '/record' },
    { icon: '🏗', label: t.evolution.studio, active: false, path: '/dashboard' },
  ]

  // Total, applied, discarded counts would come from API
  const stats = { total: 12, applied: 9, discarded: 3 }

  return (
    <div className="min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917]">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="sticky top-0 z-50 bg-white/90 dark:bg-[#1A1917]/90 backdrop-blur-md border-b border-[#E4E1DA] dark:border-white/10 h-14"
      >
        <div className="max-w-md mx-auto px-5 flex items-center justify-between h-full">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full hover:bg-[#F5F4F0] dark:hover:bg-white/5 flex items-center justify-center transition-colors"
            >
              <svg className="w-6 h-6 text-[#1A1917] dark:text-[#F5F4F0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="font-bold text-[#E8601A]" style={{ fontFamily: 'var(--font-sora)' }}>
              {t.apps?.ramKirana?.name || 'Ram Kirana'}
            </h1>
          </div>
          <button className="w-10 h-10 rounded-full hover:bg-[#F5F4F0] dark:hover:bg-white/5 flex items-center justify-center transition-colors text-[#6B6560] dark:text-[#9E9890]">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 015.646 5.646 9.001 9.001 0 0020.354 15.354z" />
            </svg>
          </button>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="pt-6 pb-24 px-5 max-w-md mx-auto">
        {/* Summary Card */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#2A2925] border border-[#E4E1DA] dark:border-white/10 rounded-3xl p-6 shadow-sm mb-8"
        >
          <h2 className="font-bold text-[#1A1917] dark:text-white mb-4" style={{ fontFamily: 'var(--font-sora)' }}>
            {t.evolution.evolutionOf} {t.apps?.ramKirana?.name || 'Ram Kirana'}
          </h2>

          {/* Stats */}
          <div className="flex justify-between mb-6">
            {[
              { label: t.evolution.total, value: String(stats.total), color: '#E8601A' },
              { label: t.evolution.applied, value: String(stats.applied), color: '#2D7A4F' },
              { label: t.evolution.discarded, value: String(stats.discarded), color: '#EF4444' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-xs text-[#6B6560] dark:text-[#9E9890] uppercase mb-1">{stat.label}</p>
                <p className="font-bold text-2xl dark:text-white" style={{ color: stat.color }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="w-full bg-[#F5F4F0] dark:bg-[#1A1917] rounded-full h-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '75%' }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="bg-[#E8601A] h-2 rounded-full"
              />
            </div>
            <p className="text-xs text-[#6B6560] dark:text-[#9E9890] text-right">
              75% {t.evolution.improvementLive}
            </p>
          </div>
        </motion.section>

        {/* Timeline */}
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[#E4E1DA] dark:bg-white/10" />

          {/* Entries */}
          <div className="space-y-6">
            {entries.map((entry, idx) => (
              <motion.article
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="relative pl-10"
              >
                {/* Timeline Dot */}
                <motion.div
                  animate={
                    entry.status === 'pending'
                      ? {
                          boxShadow: [
                            '0 0 0 0 rgba(232, 96, 26, 0.4)',
                            '0 0 0 6px rgba(232, 96, 26, 0)',
                          ]
                        }
                      : {}
                  }
                  transition={{ duration: 2, repeat: Infinity }}
                  className={`absolute left-0 top-6 w-3 h-3 rounded-full border-2 border-white dark:border-[#1A1917] ${
                    entry.status === 'pending'
                      ? 'bg-[#E8601A]'
                      : entry.status === 'merged'
                        ? 'bg-[#2D7A4F]'
                        : 'bg-[#9CA3AF]'
                  }`}
                />

                {/* Card */}
                <div
                  className={`rounded-3xl p-5 border ${
                    entry.status === 'pending'
                      ? 'bg-[#FDF0E8] dark:bg-[#2A2925] border-[#E4E1DA] dark:border-white/10'
                      : 'bg-white dark:bg-[#2A2925] border-[#E4E1DA] dark:border-white/10'
                  } ${entry.status === 'discarded' ? 'opacity-75' : ''}`}
                >
                  <h3
                    className={`font-bold text-[#1A1917] dark:text-white mb-2 ${
                      entry.status === 'discarded' ? 'line-through text-[#6B6560] dark:text-[#9E9890]' : ''
                    }`}
                    style={{ fontFamily: 'var(--font-sora)' }}
                  >
                    {t.evolutionEntries?.[entry.titleKey as keyof typeof t.evolutionEntries] || entry.titleKey}
                  </h3>

                  <p className="text-sm text-[#6B6560] dark:text-[#9E9890] mb-4">
                    {t.evolutionEntries?.[entry.descriptionKey as keyof typeof t.evolutionEntries] || entry.descriptionKey}
                  </p>

                  {entry.status === 'pending' && (
                    <div className="space-y-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => router.push('/approval')}
                        className="w-full bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-full py-3 px-6 text-xs font-semibold flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>{t.evolution.approve}</span>
                        <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-[#E8601A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </motion.button>
                      <button
                        onClick={() => router.push('/dashboard')}
                        className="w-full text-[#6B6560] dark:text-[#9E9890] text-xs font-medium hover:text-[#1A1917] dark:hover:text-[#F5F4F0] transition-colors py-2 cursor-pointer"
                      >
                        {t.evolution.reject}
                      </button>
                    </div>
                  )}

                  {entry.status === 'merged' && (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-[#F5F4F0] dark:bg-[#1A1917] rounded-lg p-3 text-center border border-[#E4E1DA] dark:border-white/10">
                        <p className="text-xs text-[#6B6560] dark:text-[#9E9890] mb-2">{t.evolution.before}</p>
                        <div className="w-full h-12 bg-white dark:bg-[#2A2925] border border-[#E4E1DA] dark:border-white/10 rounded flex items-center justify-center opacity-50">
                          <svg className="w-5 h-5 text-[#6B6560] dark:text-[#9E9890]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                          </svg>
                        </div>
                      </div>
                      <div className="bg-[#F5F4F0] dark:bg-[#1A1917] rounded-lg p-3 text-center border border-[#E4E1DA] dark:border-white/10">
                        <p className="text-xs text-[#6B6560] dark:text-[#9E9890] mb-2">{t.evolution.after}</p>
                        <div className="w-full h-12 bg-white dark:bg-[#2A2925] border border-[#E8601A] rounded flex items-center justify-center relative overflow-hidden">
                          <div className="absolute top-1 right-1 left-1 h-2 border border-[#E4E1DA] dark:border-white/10 rounded-sm flex items-center px-1">
                            <svg className="w-2 h-2 text-[#6B6560] dark:text-[#9E9890]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {entry.testsPassed && (
                    <p className="text-xs text-[#2D7A4F] flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                      </svg>
                      {entry.testsPassed} {t.evolution.testsPassed}.
                    </p>
                  )}

                  {entry.failureReason && (
                    <div className="bg-[#F5F4F0] dark:bg-[#1A1917] rounded-lg p-3 mt-3 border border-[#E4E1DA] dark:border-white/10">
                      <p className="text-xs text-[#EF4444] mb-1">Gate failed: {entry.failureReason}</p>
                      <p className="text-xs text-[#6B6560] dark:text-[#9E9890]">
                        {entry.descriptionKey}
                      </p>
                    </div>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <motion.nav
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1A1917] border-t border-[#E4E1DA] dark:border-white/10 max-w-md mx-auto"
      >
        <div className="flex justify-around items-center h-16 px-4">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => router.push(item.path)}
              className={`flex flex-col items-center justify-center gap-1 w-16 transition-colors cursor-pointer ${
                item.active
                  ? 'text-[#E8601A]'
                  : 'text-[#6B6560] dark:text-[#9E9890] hover:text-[#1A1917] dark:hover:text-[#F5F4F0]'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-xs font-medium text-center">{item.label}</span>
            </button>
          ))}
        </div>
      </motion.nav>
    </div>
  )
}
