'use client'

import { useState, useEffect } from 'react'
import { useLanguage } from '@/app/providers'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { content } from '@/lib/translations'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, AlertTriangle, ArrowUpRight, ArrowRight } from 'lucide-react'
import { SkeletonCard } from '@/components/ui/skeleton-loader'
import { BezelCard } from '@/components/ui/double-bezel'
import { ScrollReveal } from '@/components/ui/scroll-reveal'

interface AppItem {
  id: string
  nameKey: string
  nameHindi?: string
  typeKey: string
  updates: number
  status: 'live' | 'building' | 'preview' | 'error' | 'deployed'
  emoji: string
  hasImprovements: boolean
  createdAt?: string
  url?: string
}

// ─── Animation Constants ─────────────────────────────────────────────────────

const EASE_PREMIUM = [0.32, 0.72, 0, 1] as const

// ─── Category Gradient Map (replaces emoji usage) ────────────────────────────

const categoryGradients: Record<string, string> = {
  'Stock Tracker': 'from-amber-400/20 to-orange-500/10 dark:from-amber-400/10 dark:to-orange-500/5',
  'स्टॉक ट्रैकर': 'from-amber-400/20 to-orange-500/10 dark:from-amber-400/10 dark:to-orange-500/5',
  'Measurements': 'from-blue-400/20 to-indigo-500/10 dark:from-blue-400/10 dark:to-indigo-500/5',
  'माप ट्रैकर': 'from-blue-400/20 to-indigo-500/10 dark:from-blue-400/10 dark:to-indigo-500/5',
  'Daily Orders': 'from-emerald-400/20 to-teal-500/10 dark:from-emerald-400/10 dark:to-teal-500/5',
  'दैनिक ऑर्डर': 'from-emerald-400/20 to-teal-500/10 dark:from-emerald-400/10 dark:to-teal-500/5',
}

const defaultGradient = 'from-[#E8601A]/15 to-[#E8601A]/5 dark:from-[#E8601A]/10 dark:to-[#E8601A]/3'

function getCategoryGradient(type: string): string {
  return categoryGradients[type] || defaultGradient
}

/** Returns human-readable relative time like '2h ago', '3d ago' */
function relativeTime(dateStr: string | undefined, lang: 'en' | 'hi'): string {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  if (isNaN(then)) return ''
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60000)
  const hrs = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)

  if (mins < 1) return lang === 'hi' ? 'अभी' : 'Just now'
  if (mins < 60) return lang === 'hi' ? `${mins} मि. पहले` : `${mins}m ago`
  if (hrs < 24) return lang === 'hi' ? `${hrs} घं. पहले` : `${hrs}h ago`
  if (days < 30) return lang === 'hi' ? `${days} दि. पहले` : `${days}d ago`
  const months = Math.floor(days / 30)
  return lang === 'hi' ? `${months} मह. पहले` : `${months}mo ago`
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { language } = useLanguage()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [apps, setApps] = useState<AppItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteAppId, setDeleteAppId] = useState<string | null>(null)
  const [deleteInput, setDeleteInput] = useState('')

  useEffect(() => {
    setMounted(true)

    const loadApps = () =>
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
        .catch(() => {
          // No apps yet — empty state will show
        })
        .finally(() => setLoading(false))

    loadApps()

    // Poll every 8s while any app is building so dashboard stays live
    const pollInterval = setInterval(() => {
      setApps(prev => {
        const hasBuildingApp = prev.some(a => a.status === 'building')
        if (hasBuildingApp) {
          loadApps()
        }
        return prev
      })
      // Always poll once to catch newly created apps
      loadApps()
    }, 8000)

    return () => clearInterval(pollInterval)
  }, [])

  if (!mounted) return null

  const t = content[language]

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

  const handleNewApp = () => router.push('/record')
  const handleOpenApp = (appId: string) => { window.location.href = `/workbench/${appId}` }

  const handleViewUpdates = () => {
    const appWithUpdates = apps.find(a => a.hasImprovements)
    router.push(appWithUpdates ? `/approval?appId=${appWithUpdates.id}` : '/approval')
  }

  const handleDeleteClick = (e: React.MouseEvent, appId: string) => {
    e.stopPropagation()
    setDeleteAppId(appId)
    setDeleteInput('')
  }

  const handleConfirmDelete = async () => {
    if (!deleteAppId) return
    const appToDelete = apps.find(a => a.id === deleteAppId)
    if (!appToDelete) return

    const expectedName = getAppName(appToDelete)
    if (deleteInput !== expectedName) return

    try {
      const res = await fetch(`/api/apps/${deleteAppId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete app')
      setApps(prev => prev.filter(app => app.id !== deleteAppId))
      setDeleteAppId(null)
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const hasPendingImprovements = apps.some((app) => app.hasImprovements)

  return (
    <div className="relative min-h-[100dvh] bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden">
      <ShaderBackground />

      <div className="relative z-10">
        <Navigation />

        <main className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12 pb-24">
          {/* ── Page Header ──────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_PREMIUM }}
            className="mb-12 sm:mb-16"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-8 mb-8">
              <div>
                <h1
                  className="text-3xl sm:text-4xl font-bold text-[#1A1917] dark:text-white mb-2 tracking-tight"
                  style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
                >
                  {t.dashboard.title}
                  {!loading && (
                    <span className="text-[#9E9890] dark:text-[#6B6560] ml-3 text-2xl font-normal">
                      {apps.length}
                    </span>
                  )}
                </h1>
                <p className="text-sm sm:text-base text-[#6B6560] dark:text-[#9E9890]">
                  {t.dashboard.subtitle}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleNewApp}
                className="group bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-full px-6 py-3 text-sm font-semibold shadow-lg flex items-center gap-2.5 w-fit cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" strokeWidth={2} />
                <span>{t.dashboard.newApp}</span>
              </motion.button>
            </div>

            {/* ── Improvements Banner ────────────────────────────────── */}
            {!loading && hasPendingImprovements && (
              <ScrollReveal delay={200}>
                <BezelCard onClick={handleViewUpdates} className="group overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 sm:p-6">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="relative flex-shrink-0">
                        <div className="absolute inset-0 bg-[#E8601A] rounded-full animate-breathe" />
                        <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 bg-[#E8601A] rounded-full relative z-10" />
                      </div>
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-[#1A1917] dark:text-white">
                          {t.dashboard.improvementsAvailable}
                        </p>
                        <p className="text-xs text-[#6B6560] dark:text-[#9E9890] mt-0.5">
                          {t.dashboard.updates}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[#E8601A] group-hover:translate-x-1 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
                      <span className="text-xs sm:text-sm font-medium">{t.dashboard.viewUpdates}</span>
                      <ArrowRight className="w-4 h-4" strokeWidth={2} />
                    </div>
                  </div>
                </BezelCard>
              </ScrollReveal>
            )}

            {/* No improvements message */}
            {!loading && !hasPendingImprovements && apps.length > 0 && (
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

          {/* ── Apps Grid ─────────────────────────────────────────────── */}
          {loading ? (
            /* Skeleton loaders matching card layout */
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : apps.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {apps.map((app, idx) => (
                <ScrollReveal key={app.id} staggerIndex={idx}>
                  <AppCard
                    app={app}
                    name={getAppName(app)}
                    type={getAppType(app.typeKey)}
                    language={language}
                    onOpen={() => handleOpenApp(app.id)}
                    onDelete={(e) => handleDeleteClick(e, app.id)}
                  />
                </ScrollReveal>
              ))}
            </div>
          ) : (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE_PREMIUM }}
              className="flex items-center justify-center min-h-[400px]"
            >
              <BezelCard className="max-w-sm">
                <div className="p-8 sm:p-10 text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#FDF0E8] dark:bg-[#E8601A]/15 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Plus className="w-8 h-8 sm:w-10 sm:h-10 text-[#E8601A]" strokeWidth={1.5} />
                  </div>
                  <h2
                    className="text-2xl font-bold text-[#1A1917] dark:text-white mb-3 tracking-tight"
                    style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
                  >
                    {t.dashboard.startTitle}
                  </h2>
                  <p className="text-[#6B6560] dark:text-[#9E9890] text-sm leading-relaxed mb-8">
                    {t.dashboard.startDesc}
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleNewApp}
                    className="group w-full bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-full py-3 font-semibold shadow-lg flex items-center justify-center gap-2.5 cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
                  >
                    <span>{t.dashboard.getStarted}</span>
                    <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center group-hover:translate-x-0.5 transition-transform duration-300">
                      <ArrowUpRight className="w-3 h-3 text-white" strokeWidth={2} />
                    </span>
                  </motion.button>
                </div>
              </BezelCard>
            </motion.div>
          )}
        </main>
      </div>

      {/* ── Delete Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteAppId && (
          <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
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
              transition={{ duration: 0.4, ease: EASE_PREMIUM }}
              className="relative w-full max-w-md bg-white dark:bg-[#2A2925] rounded-3xl p-6 sm:p-8 ring-1 ring-black/5 dark:ring-white/10 shadow-2xl"
            >
              <button
                onClick={() => setDeleteAppId(null)}
                className="absolute top-4 right-4 p-2 text-[#6B6560] dark:text-[#9E9890] hover:text-[#1A1917] dark:hover:text-white transition-colors duration-300"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center text-red-500 flex-shrink-0 ring-1 ring-red-200 dark:ring-red-500/20">
                  <AlertTriangle className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <div>
                  <h3
                    className="text-xl font-bold text-[#1A1917] dark:text-white"
                    style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
                  >
                    {language === 'hi' ? 'प्रोजेक्ट हटाएं' : 'Delete Project'}
                  </h3>
                  <p className="text-sm text-[#6B6560] dark:text-[#9E9890]">
                    {language === 'hi' ? 'यह कार्रवाई पूर्ववत नहीं हो सकती।' : 'This action cannot be undone.'}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm text-[#6B6560] dark:text-[#9E9890] mb-4">
                  {language === 'hi'
                    ? 'यह Vercel डिप्लॉयमेंट, कोडबेस, और सभी डेटाबेस रिकॉर्ड स्थायी रूप से हटा देगा।'
                    : 'This will permanently delete the Vercel deployment, the codebase, and all database records.'}
                </p>
                <label className="block text-sm font-semibold mb-2 text-[#1A1917] dark:text-white">
                  {language === 'hi' ? 'पुष्टि करने के लिए ' : 'Type '}
                  <span className="font-bold text-red-500">
                    {apps.find(a => a.id === deleteAppId) ? getAppName(apps.find(a => a.id === deleteAppId)!) : ''}
                  </span>
                  {language === 'hi' ? ' टाइप करें' : ' to confirm'}
                </label>
                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl ring-1 ring-[#E4E1DA] dark:ring-white/10 bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all duration-300"
                  placeholder={language === 'hi' ? 'प्रोजेक्ट का नाम डालें' : 'Enter project name'}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setDeleteAppId(null)}
                  className="px-6 py-3 rounded-full font-semibold text-[#1A1917] dark:text-white ring-1 ring-[#E4E1DA] dark:ring-white/10 hover:bg-[#F5F4F0] dark:hover:bg-white/5 transition-all duration-300 w-full cursor-pointer active:scale-[0.98]"
                >
                  {language === 'hi' ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleteInput !== (apps.find(a => a.id === deleteAppId) ? getAppName(apps.find(a => a.id === deleteAppId)!) : '')}
                  className="px-6 py-3 rounded-full font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-red-500 transition-all duration-300 w-full cursor-pointer active:scale-[0.98]"
                >
                  {language === 'hi' ? 'हाँ, हटाएं' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Toast Notification ─────────────────────────────────────── */}
      <AnimatePresence>
        {!loading && hasPendingImprovements && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            transition={{ duration: 0.5, ease: EASE_PREMIUM }}
            className="fixed top-24 right-6 sm:right-8 z-[var(--z-modal)]"
          >
            <BezelCard onClick={handleViewUpdates} className="!p-0">
              <div className="flex items-center gap-4 p-4">
                <div className="relative flex-shrink-0">
                  <div className="absolute inset-0 bg-[#E8601A] rounded-full animate-breathe" />
                  <div className="w-3 h-3 bg-[#E8601A] rounded-full relative z-10" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#1A1917] dark:text-white">
                    {language === 'hi' ? 'अपडेट उपलब्ध' : 'Update Available'}
                  </p>
                  <p className="text-xs text-[#6B6560] dark:text-[#9E9890] mt-0.5">
                    1 {language === 'hi' ? 'अपडेट' : 'update'} {getAppName(apps.find(a => a.hasImprovements)!)}
                  </p>
                </div>
              </div>
            </BezelCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── AppCard — Premium card with category gradients (no emoji) ────────────────

function AppCard({
  app,
  name,
  type,
  language,
  onOpen,
  onDelete,
}: {
  app: AppItem
  name: string
  type: string
  language: 'en' | 'hi'
  onOpen: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const gradient = getCategoryGradient(type)
  const isLive = app.status === 'live'
  const isBuilding = app.status === 'building'
  const isPreview = app.status === 'preview'
  const isError = app.status === 'error'
  const isDeployed = app.status === 'deployed'

  // Status config: color, dot animation, label
  const statusConfig = {
    live:     { dotColor: 'bg-emerald-500', textColor: 'text-emerald-600 dark:text-emerald-400', label: language === 'hi' ? 'लाइव' : 'Live', animate: false },
    deployed: { dotColor: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400', label: language === 'hi' ? 'डिप्लॉय' : 'Deployed', animate: false },
    preview:  { dotColor: 'bg-[#E8601A]', textColor: 'text-[#E8601A]', label: language === 'hi' ? 'प्रीव्यू' : 'Preview', animate: false },
    building: { dotColor: 'bg-amber-400', textColor: 'text-amber-600 dark:text-amber-400', label: language === 'hi' ? 'निर्माण में' : 'Building', animate: true },
    error:    { dotColor: 'bg-red-500', textColor: 'text-red-500', label: language === 'hi' ? 'त्रुटि' : 'Error', animate: false },
  }[app.status]

  return (
    <BezelCard hoverable onClick={onOpen} className="overflow-hidden group">
      {/* Preview Area — category gradient (replaces emoji) */}
      <div className={`aspect-video bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden`}>
        {/* Category initial letter */}
        <span
          className="text-6xl sm:text-7xl font-bold text-[#E8601A]/10 dark:text-[#E8601A]/8 select-none"
          style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
        >
          {name.charAt(0).toUpperCase()}
        </span>

        {/* Status Badge — dynamic */}
        <div className="absolute top-3 left-3">
          <div className={`rounded-full px-2.5 py-1 text-[10px] font-medium flex items-center gap-1.5 bg-white/90 dark:bg-[#2A2925]/90 backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10 ${statusConfig.textColor}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotColor} ${statusConfig.animate ? 'animate-pulse' : ''}`} />
            {statusConfig.label}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-5">
        <h3
          className="font-bold text-[#1A1917] dark:text-white mb-2 text-lg tracking-tight"
          style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
        >
          {name}
        </h3>

        <div className="flex items-center gap-2 mb-4">
          <span className="inline-block px-3 py-1 bg-[#FDF0E8] dark:bg-[#E8601A]/15 text-[#E8601A] text-xs font-medium rounded-full ring-1 ring-[#E8601A]/10">
            {type}
          </span>
          {app.createdAt && (
            <span className="text-[10px] text-[#9E9890] dark:text-[#6B6560]">
              {relativeTime(app.createdAt, language)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#E4E1DA] dark:border-white/10">
          <div className="flex items-center gap-3 text-xs text-[#6B6560] dark:text-[#9E9890]">
            {app.updates > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-current" />
                <span>{app.updates} {content[language].uiComponents.updates}</span>
              </div>
            )}
            {app.url && (
              <div className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                <span className="truncate max-w-[100px]">{app.url.replace(/^https?:\/\//, '').split('/')[0]}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(e)
              }}
              className="text-[#9E9890] hover:text-red-500 dark:hover:text-red-400 transition-colors duration-300 p-1"
              title={language === 'hi' ? 'हटाएं' : 'Delete'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <span className="text-[#E8601A] text-xs font-medium group-hover:translate-x-0.5 transition-transform duration-300">
              {content[language].uiComponents.open} →
            </span>
          </div>
        </div>
      </div>
    </BezelCard>
  )
}
