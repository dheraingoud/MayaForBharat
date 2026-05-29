'use client'

import { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { useLanguage } from '@/app/providers'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { AppCard } from '@/components/ui-components'
import { content } from '@/lib/translations'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, AlertTriangle } from 'lucide-react'

interface AppItem {
  id: string
  nameKey: string
  nameHindi?: string
  typeKey: string
  updates: number
  status: 'live' | 'building'
  emoji: string
  hasImprovements: boolean
}

// No mock data — real apps only
export default function Dashboard() {
  const { theme } = useTheme()
  const { language } = useLanguage()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [apps, setApps] = useState<AppItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteAppId, setDeleteAppId] = useState<string | null>(null)
  const [deleteInput, setDeleteInput] = useState('')

  useEffect(() => {
    setMounted(true)
    fetch('/api/dashboard')
      .then((r) => {
        if (!r.ok) throw new Error('API not ready')
        return r.json()
      })
      .then((data) => {
        if (data.apps && Array.isArray(data.apps)) {
          setApps(data.apps)
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .catch(() => {
        // No apps yet — empty state will show
      })
      .finally(() => setLoading(false))
  }, [])

  if (!mounted) return null

  const t = content[language]

  // Get app display name — use Hindi name when in Hindi mode, fallback to key
  const getAppName = (app: AppItem) => {
    if (language === 'hi' && app.nameHindi) return app.nameHindi
    // @ts-expect-error dynamic key access
    const appData = t.apps?.[app.nameKey]
    return appData?.name || app.nameKey
  }

  const getAppType = (key: string) => {
    // @ts-expect-error dynamic key access
    const appData = t.apps?.[key]
    return appData?.type || key
  }

  const handleNewApp = () => {
    router.push('/record')
  }

  const handleOpenApp = (appId: string) => {
    router.push(`/app/${appId}`)
  }

  const handleViewUpdates = () => {
    const appWithUpdates = apps.find(a => a.hasImprovements)
    if (appWithUpdates) {
      router.push(`/approval?appId=${appWithUpdates.id}`)
    } else {
      router.push('/approval')
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, appId: string) => {
    e.stopPropagation() // Prevent opening the app
    setDeleteAppId(appId)
    setDeleteInput('')
  }

  const handleConfirmDelete = async () => {
    if (!deleteAppId) return
    const appToDelete = apps.find(a => a.id === deleteAppId)
    if (!appToDelete) return

    const expectedName = getAppName(appToDelete)
    if (deleteInput !== expectedName) {
      alert('Project name does not match')
      return
    }

    try {
      const res = await fetch(`/api/apps/${deleteAppId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete app')
      
      setApps(prev => prev.filter(app => app.id !== deleteAppId))
      setDeleteAppId(null)
    } catch (err) {
      console.error('Delete failed:', err)
      alert('Failed to delete app')
    }
  }

  // Only show improvements card if there are actual improvements pending
  const hasPendingImprovements = apps.some((app) => app.hasImprovements)

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  }

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden">
      <ShaderBackground />

      <div className="relative z-10">
        <Navigation />

        <main className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12 pb-24">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-12 sm:mb-16"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-8 mb-8">
              <div>
                <h1
                  className="text-3xl sm:text-4xl font-bold text-[#1A1917] dark:text-white mb-2"
                  style={{ fontFamily: 'var(--font-sora)' }}
                >
                  {t.dashboard.title} ({apps.length})
                </h1>
                <p className="text-sm sm:text-base text-[#6B6560] dark:text-[#9E9890]">{t.dashboard.subtitle}</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNewApp}
                className="bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-full px-6 py-3 text-sm font-semibold transition-colors shadow-lg flex items-center gap-2 w-fit"
              >
                <Plus className="w-4 h-4" />
                <span>{t.dashboard.newApp}</span>
              </motion.button>
            </div>

            {/* Overnight Updates Card - Only show if there are actual improvements */}
            {loading === false && hasPendingImprovements && (
              <motion.button
                onClick={handleViewUpdates}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full group relative overflow-hidden rounded-2xl sm:rounded-3xl p-5 sm:p-6 backdrop-blur-md transition-all duration-300 hover:shadow-lg hover:shadow-[#E8601A]/20 dark:hover:shadow-[#E8601A]/30 active:scale-[0.98]"
              >
                {/* Gradient Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/80 to-white/40 dark:from-[#2A2925]/80 dark:to-[#2A2925]/40 border border-white/30 dark:border-white/10" />

                {/* Content */}
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* Left: Indicator + Text */}
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="relative flex-shrink-0">
                      <div className="absolute inset-0 bg-[#E8601A] rounded-full animate-pulse opacity-40" />
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-3 h-3 sm:w-3.5 sm:h-3.5 bg-[#E8601A] rounded-full"
                      />
                    </div>
                    <div className="text-left">
                      <p className="text-xs sm:text-sm font-semibold text-[#1A1917] dark:text-white">
                        {t.dashboard.improvementsAvailable}
                      </p>
                      <p className="text-xs text-[#6B6560] dark:text-[#9E9890] mt-0.5">
                        {t.dashboard.updates}
                      </p>
                    </div>
                  </div>

                  {/* Right: CTA */}
                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="text-xs sm:text-sm font-medium text-[#E8601A] group-hover:text-[#C94E12] transition-colors">
                      {t.dashboard.viewUpdates}
                    </span>
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#E8601A] group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </motion.button>
            )}

            {/* No improvements message */}
            {loading === false && !hasPendingImprovements && apps.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-sm text-[#9E9890] dark:text-[#6B6560]"
              >
                {t.dashboard.noImprovements}
              </motion.div>
            )}
          </motion.div>

          {/* Apps Grid */}
          {loading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8601A]" />
            </div>
          ) : apps.length > 0 ? (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
            >
              {apps.map((app) => (
                <motion.div
                  key={app.id}
                  variants={itemVariants}
                >
                  <AppCard
                    name={getAppName(app)}
                    type={getAppType(app.typeKey)}
                    emoji={app.emoji}
                    status={app.status}
                    updates={app.updates}
                    onOpen={() => handleOpenApp(app.id)}
                    onDelete={(e) => handleDeleteClick(e, app.id)}
                    language={language}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center min-h-[400px]"
            >
              <div className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 p-8 sm:p-12 max-w-sm text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#FDF0E8] dark:bg-[#E8601A]/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <div className="text-4xl sm:text-5xl flex items-center justify-center">
                    <svg className="w-8 h-8 sm:w-10 sm:h-10 text-[#E8601A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 13m-7 4v2m0-12V4m0 8a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-[#1A1917] dark:text-white mb-3" style={{ fontFamily: 'var(--font-sora)' }}>
                  {t.dashboard.startTitle}
                </h2>
                <p className="text-[#6B6560] dark:text-[#9E9890] text-sm leading-relaxed mb-6">
                  {t.dashboard.startDesc}
                </p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleNewApp}
                  className="w-full bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-full py-3 font-semibold transition-colors shadow-lg"
                >
                  {t.dashboard.getStarted}
                </motion.button>
              </div>
            </motion.div>
          )}
        </main>
      </div>

      {/* Delete Modal */}
      <AnimatePresence>
        {deleteAppId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#1A1917]/40 backdrop-blur-sm"
              onClick={() => setDeleteAppId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white dark:bg-[#2A2925] rounded-3xl p-6 sm:p-8 border border-[#E4E1DA] dark:border-white/10 shadow-2xl"
            >
              <button
                onClick={() => setDeleteAppId(null)}
                className="absolute top-4 right-4 p-2 text-[#6B6560] dark:text-[#9E9890] hover:text-[#1A1917] dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-500 flex-shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#1A1917] dark:text-white">Delete Project</h3>
                  <p className="text-sm text-[#6B6560] dark:text-[#9E9890]">This action cannot be undone.</p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm text-[#6B6560] dark:text-[#9E9890] mb-4">
                  This will permanently delete the Vercel deployment, the codebase, and all database records.
                </p>
                <label className="block text-sm font-semibold mb-2 text-[#1A1917] dark:text-white">
                  Type <span className="font-bold text-red-500">{apps.find(a => a.id === deleteAppId) ? getAppName(apps.find(a => a.id === deleteAppId)!) : ''}</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-[#E4E1DA] dark:border-white/10 bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all"
                  placeholder="Enter project name"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setDeleteAppId(null)}
                  className="px-6 py-3 rounded-full font-semibold text-[#1A1917] dark:text-white border border-[#E4E1DA] dark:border-white/10 hover:bg-[#F5F4F0] dark:hover:bg-white/5 transition-colors w-full"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteInput !== (apps.find(a => a.id === deleteAppId) ? getAppName(apps.find(a => a.id === deleteAppId)!) : '')}
                  className="px-6 py-3 rounded-full font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500 transition-colors w-full"
                >
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Top-Right Toast Notification for Updates */}
      <AnimatePresence>
        {loading === false && hasPendingImprovements && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="fixed top-24 right-6 sm:right-8 z-50"
          >
            <div
              className="bg-white dark:bg-[#2A2925] border border-[#E4E1DA] dark:border-[#E8601A]/30 shadow-2xl rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:shadow-[#E8601A]/20 transition-all active:scale-[0.98]"
              onClick={handleViewUpdates}
            >
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 bg-[#E8601A] rounded-full animate-pulse opacity-40" />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-3 h-3 bg-[#E8601A] rounded-full relative z-10"
                />
              </div>
              <div>
                <p className="text-sm font-bold text-[#1A1917] dark:text-white">
                  Update Available
                </p>
                <p className="text-xs text-[#6B6560] dark:text-[#9E9890] mt-0.5">
                  1 update for {getAppName(apps.find(a => a.hasImprovements)!)}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
