'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { useLanguage } from '@/app/providers'
import { motion } from 'framer-motion'
import { ExternalLink, Edit3, RefreshCw, ArrowLeft, Globe, Zap, Clock, TrendingUp } from 'lucide-react'

interface AppData {
  id: string
  name: string
  nameHindi?: string
  descriptionEn?: string
  category: string
  url: string
  projectId: string
  createdAt: string
  status: 'live' | 'building'
}

export default function AppDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { language } = useLanguage()
  const appId = params.id as string

  const [mounted, setMounted] = useState(false)
  const [app, setApp] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [iframeLoaded, setIframeLoaded] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Load app data from the store
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(data => {
        const found = data.apps?.find((a: { id: string }) => a.id === appId)
        if (found) {
          setApp({
            id: found.id,
            name: found.nameKey,
            nameHindi: found.nameHindi,
            descriptionEn: found.descriptionEn,
            category: found.typeKey,
            url: found.url || '',
            projectId: found.projectId || '',
            createdAt: found.createdAt || new Date().toISOString(),
            status: found.status || 'live',
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [appId])

  if (!mounted) return null

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden">
      <ShaderBackground />

      <div className="relative z-10">
        <Navigation />

        <main className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12">
          {/* Back Button */}
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-sm text-[#6B6560] dark:text-[#9E9890] hover:text-[#E8601A] transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            {language === 'hi' ? 'डैशबोर्ड' : 'Dashboard'}
          </motion.button>

          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8601A]" />
            </div>
          ) : !app ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center min-h-[400px]"
            >
              <div className="text-center">
                <div className="text-5xl mb-4">🔍</div>
                <h2 className="text-xl font-bold mb-2">
                  {language === 'hi' ? 'ऐप नहीं मिला' : 'App Not Found'}
                </h2>
                <p className="text-sm text-[#6B6560] dark:text-[#9E9890]">
                  {language === 'hi' ? 'यह ऐप मौजूद नहीं है' : 'This app does not exist'}
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* App Info Panel */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="lg:col-span-1 space-y-4"
              >
                {/* Status Card */}
                <div className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-[#FDF0E8] dark:bg-[#E8601A]/20 rounded-2xl flex items-center justify-center">
                      <Globe className="w-6 h-6 text-[#E8601A]" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-sora)' }}>
                        {language === 'hi' && app.nameHindi ? app.nameHindi : app.name}
                      </h1>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${app.status === 'live' ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
                        <span className="text-xs text-[#6B6560] dark:text-[#9E9890] capitalize">{app.status}</span>
                      </div>
                    </div>
                  </div>

                  {app.descriptionEn && (
                    <p className="text-sm text-[#6B6560] dark:text-[#9E9890] mb-4">{app.descriptionEn}</p>
                  )}

                  <div className="flex items-center gap-2 text-xs text-[#9E9890]">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(app.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 p-6 space-y-3">
                  <h3 className="text-sm font-semibold text-[#6B6560] dark:text-[#9E9890] uppercase tracking-wider mb-3">
                    {language === 'hi' ? 'क्रियाएँ' : 'Actions'}
                  </h3>

                  {app.url && (
                    <motion.a
                      href={app.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-3 w-full px-4 py-3 bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-2xl font-semibold text-sm transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {language === 'hi' ? 'ऐप खोलें' : 'Open Live App'}
                    </motion.a>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => router.push(`/app/${appId}/edit`)}
                    className="flex items-center gap-3 w-full px-4 py-3 border border-[#E4E1DA] dark:border-white/10 rounded-2xl font-semibold text-sm hover:bg-[#F5F4F0] dark:hover:bg-white/5 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    {language === 'hi' ? 'बातचीत से संपादित करें' : 'Edit via Chat'}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      fetch('/api/evolution', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          appId: app.id,
                          name: app.name,
                          description: app.descriptionEn || '',
                          vercelUrl: app.url,
                        }),
                      })
                    }}
                    className="flex items-center gap-3 w-full px-4 py-3 border border-[#E4E1DA] dark:border-white/10 rounded-2xl font-semibold text-sm hover:bg-[#F5F4F0] dark:hover:bg-white/5 transition-colors"
                  >
                    <Zap className="w-4 h-4 text-[#E8601A]" />
                    {language === 'hi' ? 'विकास चक्र चलाएं' : 'Run Evolution Cycle'}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => router.push(`/app/${appId}/evolution`)}
                    className="flex items-center gap-3 w-full px-4 py-3 border border-[#E4E1DA] dark:border-white/10 rounded-2xl font-semibold text-sm hover:bg-[#F5F4F0] dark:hover:bg-white/5 transition-colors"
                  >
                    <TrendingUp className="w-4 h-4 text-[#2D7A4F]" />
                    {language === 'hi' ? 'विकास लॉग देखें' : 'View Evolution Log'}
                  </motion.button>
                </div>
              </motion.div>

              {/* Live Preview iframe */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="lg:col-span-2"
              >
                <div className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 overflow-hidden">
                  {/* Browser chrome */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E4E1DA] dark:border-white/10">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 text-center">
                      <span className="text-xs text-[#9E9890] bg-[#F5F4F0] dark:bg-[#1A1917] px-4 py-1 rounded-full">
                        {app.url || 'Preview'}
                      </span>
                    </div>
                    <motion.button
                      whileHover={{ rotate: 180 }}
                      transition={{ duration: 0.3 }}
                      onClick={() => {
                        setIframeLoaded(false)
                        const iframe = document.querySelector('iframe')
                        if (iframe) iframe.src = iframe.src
                      }}
                      className="p-1 text-[#9E9890] hover:text-[#E8601A]"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </motion.button>
                  </div>

                  {/* iframe */}
                  <div className="relative" style={{ height: '70vh', minHeight: '500px' }}>
                    {!iframeLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#F5F4F0] dark:bg-[#1A1917]">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8601A] mx-auto mb-3" />
                          <p className="text-sm text-[#9E9890]">
                            {language === 'hi' ? 'लोड हो रहा है...' : 'Loading preview...'}
                          </p>
                        </div>
                      </div>
                    )}
                    {app.url ? (
                      <iframe
                        src={app.url}
                        className="w-full h-full border-0"
                        onLoad={() => setIframeLoaded(true)}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        title={`${app.name} preview`}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-[#9E9890]">
                          {language === 'hi' ? 'कोई URL उपलब्ध नहीं' : 'No URL available for preview'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
