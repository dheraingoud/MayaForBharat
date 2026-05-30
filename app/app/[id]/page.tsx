'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { useLanguage } from '@/app/providers'
import { motion, AnimatePresence } from 'framer-motion'
import { ExternalLink, RefreshCw, Loader2, ArrowLeft } from 'lucide-react'
import { AppChat } from '@/components/app-chat'

interface AppMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface AppData {
  id: string
  name: string
  nameHindi?: string
  descriptionEn?: string
  category: string
  url: string
  projectId: string
  createdAt: string
  status: 'live' | 'building' | 'evolving'
  adminUsername?: string
  adminPin?: string
  shownToOwner?: boolean
  messages?: AppMessage[]
}

export default function AppDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { language } = useLanguage()
  const appId = params.id as string

  const [mounted, setMounted] = useState(false)
  const [app, setApp] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Iframe states
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [isDeploying, setIsDeploying] = useState(true)

  useEffect(() => {
    setMounted(true)
    fetchApp()
  }, [appId])

  const fetchApp = async () => {
    try {
      const r = await fetch('/api/dashboard')
      const data = await r.json()
      const found = data.apps?.find((a: { id: string }) => a.id === appId)
      if (found) {
        setApp({
          id: found.id,
          name: found.nameKey || found.name,
          nameHindi: found.nameHindi,
          descriptionEn: found.descriptionEn,
          category: found.typeKey || found.category,
          url: found.url || '',
          projectId: found.projectId || '',
          createdAt: found.createdAt || new Date().toISOString(),
          status: found.status || 'live',
          adminUsername: found.adminUsername,
          adminPin: found.adminPin,
          shownToOwner: found.shownToOwner,
          messages: found.messages || [],
        })
        
        // Start polling the Vercel URL
        if (found.url) {
          checkVercelUrl(found.url)
        }

        if (found.adminPin && !found.shownToOwner) {
          setTimeout(() => {
            fetch(`/api/apps/${found.id}`, { method: 'PATCH' }).catch(console.error)
          }, 2000)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Poll the production URL to see if it's returning 200 OK
  const checkVercelUrl = async (url: string) => {
    setIsDeploying(true)
    let attempts = 0
    const maxAttempts = 60 // 2 minutes (2s intervals)
    
    const check = async () => {
      try {
        const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' })
        // If we get here without a network error, it's highly likely it's live
        // Since no-cors hides the status, we assume it's live if it resolves quickly
        // A better approach is fetching our own proxy or just relying on it resolving.
        // Actually, we can fetch the home page HTML via a proxy route if needed, 
        // but simple resolution usually means Vercel routed it.
        setIsDeploying(false)
        setIframeUrl(url)
        return true
      } catch (e) {
        return false
      }
    }

    // Try once immediately
    if (await check()) return

    const interval = setInterval(async () => {
      attempts++
      if (await check() || attempts >= maxAttempts) {
        clearInterval(interval)
        setIsDeploying(false)
        setIframeUrl(url) // Give up and just show it
      }
    }, 2000)
  }

  if (!mounted) return null

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#E8601A]" />
      </div>
    )
  }

  if (!app) {
    return (
      <div className="min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] flex flex-col items-center justify-center text-center px-4">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-xl font-bold mb-2 text-[#1A1917] dark:text-[#F5F4F0]">
          {language === 'hi' ? 'ऐप नहीं मिला' : 'App Not Found'}
        </h2>
        <button onClick={() => router.push('/dashboard')} className="mt-4 text-[#E8601A] hover:underline">
          Go back to dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-[#F5F4F0] dark:bg-[#1A1917] flex overflow-hidden text-[#1A1917] dark:text-[#F5F4F0]">
      {/* Background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-50">
        <ShaderBackground />
      </div>

      {/* Floating Top-Left Nav */}
      <div className="absolute top-4 left-4 z-50">
        <Navigation position="top-left" />
      </div>

      {/* Main Layout */}
      <div className="flex w-full h-full z-10 p-2 gap-2">
        
        {/* Left Panel: Chat Interface (30% width) */}
        <div className="w-[30%] min-w-[300px] max-w-[400px] flex flex-col h-full bg-white/80 dark:bg-[#2A2925]/80 backdrop-blur-xl border border-[#E4E1DA] dark:border-white/10 rounded-2xl shadow-xl overflow-hidden relative pt-[52px]">
          
          <div className="px-4 py-3 border-b border-[#E4E1DA] dark:border-white/10 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm" style={{ fontFamily: 'var(--font-sora)' }}>
                {language === 'hi' && app.nameHindi ? app.nameHindi : app.name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${app.status === 'live' ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
                <span className="text-[10px] text-[#6B6560] dark:text-[#9E9890] capitalize">
                  {app.status === 'live' ? (language === 'hi' ? 'लाइव' : 'Live') : (language === 'hi' ? 'बिल्ड हो रहा है' : 'Building/Evolving')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <AppChat app={app} onUpdate={fetchApp} />
          </div>

        </div>

        {/* Right Panel: Full-bleed Iframe */}
        <div className="flex-1 flex flex-col h-full bg-[#E4E1DA] dark:bg-white/10 rounded-2xl shadow-2xl overflow-hidden relative p-[0.5px]">
          {/* Iframe Body */}
          <div className="flex-1 relative bg-[#F5F4F0] dark:bg-black rounded-[calc(1rem-0.5px)] overflow-hidden">
            <AnimatePresence mode="wait">
              {isDeploying ? (
                <motion.div
                  key="deploying"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-[#1A1917] z-10"
                >
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-[#FDF0E8] dark:border-[#E8601A]/20 rounded-full" />
                    <div className="w-16 h-16 border-4 border-[#E8601A] rounded-full border-t-transparent animate-spin absolute inset-0" />
                  </div>
                  <h3 className="mt-6 text-lg font-semibold text-[#1A1917] dark:text-white">
                    {language === 'hi' ? 'एज नेटवर्क पर डिप्लॉय हो रहा है...' : 'Deploying to Edge Network...'}
                  </h3>
                  <p className="mt-2 text-sm text-[#6B6560] dark:text-[#9E9890]">
                    {language === 'hi' ? 'इसमें 45-60 सेकंड लग सकते हैं' : 'This usually takes 45-60 seconds'}
                  </p>
                </motion.div>
              ) : !iframeLoaded ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-white dark:bg-[#1A1917] z-10"
                >
                  <Loader2 className="w-8 h-8 animate-spin text-[#E8601A]" />
                </motion.div>
              ) : null}
            </AnimatePresence>

            {iframeUrl && (
              <iframe
                src={iframeUrl}
                className="w-full h-full border-0 absolute inset-0 z-0 bg-white"
                onLoad={() => setIframeLoaded(true)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                title={`${app.name} preview`}
              />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
