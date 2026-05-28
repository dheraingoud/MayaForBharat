'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useLanguage } from '@/app/providers'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { content } from '@/lib/translations'
import { motion } from 'framer-motion'
import { CheckCircle, ArrowUpRight, ChevronRight } from 'lucide-react'

interface Update {
  id: string
  appKey: string
  typeKey: string
  featureKey: string
  improvementKey: string
  timestamp: string
  icon: string
  viewed: boolean
}

export default function Updates() {
  const { language } = useLanguage()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const t = content[language]

  const updates: Update[] = [
    {
      id: '1',
      appKey: 'ramKirana',
      typeKey: 'ramKirana',
      featureKey: 'automaticReorder',
      improvementKey: 'automaticReorder',
      timestamp: '2 hours ago',
      icon: '🔔',
      viewed: false,
    },
    {
      id: '2',
      appKey: 'shyamTailors',
      typeKey: 'shyamTailors',
      featureKey: 'voiceMeasurement',
      improvementKey: 'voiceMeasurement',
      timestamp: '4 hours ago',
      icon: '🎙️',
      viewed: false,
    },
    {
      id: '3',
      appKey: 'dairyPlus',
      typeKey: 'dairyPlus',
      featureKey: 'morningReport',
      improvementKey: 'morningReport',
      timestamp: '8 hours ago',
      icon: '📊',
      viewed: true,
    },
  ]

  if (!mounted) return null

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.2,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: 'easeOut' as const },
    },
  }

  const handleUpdateClick = (updateId: string) => {
    console.log('[v0] Update viewed:', updateId)
  }

  const handleBackClick = () => {
    router.back()
  }

  const unviewedCount = updates.filter((u) => !u.viewed).length

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden">
      <ShaderBackground />

      <div className="relative z-10">
        <Navigation />

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12 pb-24">
          {/* Page Header with Back Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8 sm:mb-12 flex items-center justify-between"
          >
            <div>
              <button
                onClick={handleBackClick}
                className="inline-flex items-center gap-2 text-[#6B6560] dark:text-[#9E9890] hover:text-[#1A1917] dark:hover:text-[#F5F4F0] transition-colors mb-4"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
                <span className="text-sm font-medium">{t.updates.back}</span>
              </button>
              <h1
                className="text-3xl sm:text-4xl font-bold text-[#1A1917] dark:text-white"
                style={{ fontFamily: 'var(--font-sora)' }}
              >
                {t.updates.title}
              </h1>
              <p className="text-sm sm:text-base text-[#6B6560] dark:text-[#9E9890] mt-2">
                {unviewedCount > 0
                  ? `${unviewedCount} ${t.updates.newUpdates}`
                  : t.updates.allViewed}
              </p>
            </div>
          </motion.div>

          {/* Updates List */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3 sm:space-y-4"
          >
            {updates.map((update, idx) => {
              const appData = t.apps?.[update.appKey as keyof typeof t.apps] as
                                | { name: string; type: string }
                                | undefined
              const updateData = t.updateItems?.[
                update.featureKey as keyof typeof t.updateItems
              ] as { feature: string; improvement: string } | undefined

              return (
                <motion.button
                  key={update.id}
                  variants={itemVariants}
                  onClick={() => handleUpdateClick(update.id)}
                  className={`w-full text-left transition-all duration-300 group`}
                >
                  <div
                    className={`relative overflow-hidden rounded-2xl sm:rounded-3xl border backdrop-blur-sm p-4 sm:p-6 hover:shadow-lg hover:shadow-[#E8601A]/10 dark:hover:shadow-[#E8601A]/20 transition-all duration-300 ${
                      !update.viewed
                        ? 'bg-white/80 dark:bg-[#2A2925]/80 border-[#E8601A]/30 dark:border-[#E8601A]/40 shadow-md shadow-[#E8601A]/5'
                        : 'bg-white/50 dark:bg-[#2A2925]/50 border-[#E4E1DA]/50 dark:border-white/5'
                    }`}
                  >
                    {/* Unread Indicator */}
                    {!update.viewed && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-[#E8601A]" />
                    )}

                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#E8601A]/20 to-[#E8601A]/5 dark:from-[#E8601A]/30 dark:to-[#E8601A]/10 flex items-center justify-center text-lg sm:text-xl">
                          {update.icon}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-sm sm:text-base text-[#1A1917] dark:text-white">
                                {appData?.name || update.appKey}
                              </h3>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[#E8601A]/10 dark:bg-[#E8601A]/20 text-[#E8601A]">
                                {appData?.type || update.typeKey}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-[#6B6560] dark:text-[#9E9890]">
                              {updateData?.feature || update.featureKey}
                            </p>
                          </div>
                          {!update.viewed && (
                            <div className="flex-shrink-0">
                              <motion.div
                                animate={{ scale: [1, 1.1, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="w-3 h-3 rounded-full bg-[#E8601A]"
                              />
                            </div>
                          )}
                        </div>

                        {/* Improvement Description */}
                        <p className="text-xs sm:text-sm text-[#6B6560] dark:text-[#9E9890] leading-relaxed mb-3 group-hover:text-[#1A1917] dark:group-hover:text-[#F5F4F0] transition-colors">
                          {updateData?.improvement || update.improvementKey}
                        </p>

                        {/* Footer */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[#9E9890] dark:text-[#6B6560]">
                            {update.timestamp}
                          </span>
                          <div className="inline-flex items-center gap-1 text-[#E8601A] text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            {t.updates.view}
                            <ArrowUpRight className="w-3 h-3" />
                          </div>
                        </div>
                      </div>

                      {/* Viewed Indicator */}
                      {update.viewed && (
                        <div className="flex-shrink-0 hidden sm:flex">
                          <CheckCircle className="w-5 h-5 text-[#2D7A4F]" />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </motion.div>

          {/* Call to Action */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="mt-12 sm:mt-16 text-center"
          >
            <button
              onClick={handleBackClick}
              className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-full font-semibold transition-colors shadow-lg"
            >
              {t.updates.viewAllApps}
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </motion.div>
        </main>
      </div>
    </div>
  )
}
