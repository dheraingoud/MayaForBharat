'use client'

import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { useLanguage } from '@/app/providers'
import { content } from '@/lib/translations'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Save, Trash2, Loader2, CheckCircle2, Zap, Code2, Rocket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 },
}

type BuildStage = 'idle' | 'preparing' | 'generating' | 'deploying' | 'done' | 'error'

const STAGE_INFO: Record<BuildStage, { icon: React.ReactNode; labelHi: string; labelEn: string; pct: number }> = {
  idle:      { icon: <Save className="w-5 h-5" />,        labelHi: 'ऐप बनाएं',          labelEn: 'Create App',         pct: 0 },
  preparing: { icon: <Loader2 className="w-5 h-5 animate-spin" />, labelHi: 'स्पेक तैयार हो रहा है...', labelEn: 'Preparing spec...', pct: 10 },
  generating:{ icon: <Code2 className="w-5 h-5 animate-pulse" />,  labelHi: 'AI कोड लिख रहा है...', labelEn: 'AI writing code...', pct: 40 },
  deploying: { icon: <Rocket className="w-5 h-5 animate-bounce" />,labelHi: 'Vercel पर डिप्लॉय...',  labelEn: 'Deploying to Vercel...', pct: 80 },
  done:      { icon: <CheckCircle2 className="w-5 h-5" />, labelHi: '✅ ऐप लाइव!',       labelEn: '✅ App is live!',     pct: 100 },
  error:     { icon: <Zap className="w-5 h-5" />,          labelHi: '❌ गड़बड़ हुई',       labelEn: '❌ Build failed',     pct: 0 },
}

export default function BuilderPage() {
  const { language } = useLanguage()
  const { theme } = useTheme()
  const router = useRouter()
  const t = content[language]
  const [mounted, setMounted] = useState(false)
  const [spec, setSpec] = useState<{
    name: string
    nameHindi: string
    descriptionEn: string
    category: string
    features: string[]
    dataFields: { name: string; type: string }[]
    userType: string
  } | null>(null)
  const [appName, setAppName] = useState('')
  const [appDescription, setAppDescription] = useState('')
  const [buildStage, setBuildStage] = useState<BuildStage>('idle')
  const [buildError, setBuildError] = useState<string | null>(null)
  const [builtAppId, setBuiltAppId] = useState<string | null>(null)
  const [builtUrl, setBuiltUrl] = useState<string | null>(null)
  const [sseMessage, setSseMessage] = useState<string>('')

  useEffect(() => {
    setMounted(true)
    // Load spec from localStorage if coming from /record
    try {
      const raw = localStorage.getItem('maya-app-spec')
      if (raw) {
        const s = JSON.parse(raw)
        setSpec(s)
        setAppName(s.name || '')
        setAppDescription(s.descriptionEn || '')
      } else {
        // No spec → redirect to record page
        router.replace('/record')
      }
    } catch {
      router.replace('/record')
    }
  }, [router])

  useEffect(() => {
    if (spec && buildStage === 'idle' && mounted) {
      handleCreateApp()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, mounted])
  async function handleCreateApp() {
    if (!spec || buildStage !== 'idle') return
    setBuildError(null)

    setBuildStage('preparing')
    setSseMessage('Connecting to builder...')

    try {
      // Remove spec from local storage immediately so a page refresh doesn't trigger a duplicate build
      localStorage.removeItem('maya-app-spec')

      const res = await fetch('/api/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: { ...spec, name: appName || spec.name, descriptionEn: appDescription || spec.descriptionEn },
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setBuildError(body.error || `Build failed: ${res.status}`)
        setBuildStage('error')
        return
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream returned from build API')
      const decoder = new TextDecoder()

      let currentAppId = ''
      let isDone = false
      let isError = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'stage') {
                setBuildStage(data.stage)
              } else if (data.type === 'progress') {
                if (data.message.includes('chunks')) {
                  const match = data.message.match(/generating\.\.\. \((\d+) chunks\)/)
                  const count = match ? match[1] : ''
                  setSseMessage(language === 'hi' ? `कोड लिख रहा हूँ... (${count} चंक्स)` : `Writing application code... (${count} chunks)`)
                } else if (data.message.includes('Retrying')) {
                  setSseMessage(language === 'hi' ? 'कोड सुधार रहा हूँ...' : 'Optimizing application code...')
                } else if (data.message === 'building_code') {
                  setSseMessage(language === 'hi' ? 'ऐप का निर्माण शुरू कर रहा हूँ...' : 'Starting application build...')
                } else if (data.message.startsWith('building ')) {
                  const filename = data.message.replace('building ', '')
                  setSseMessage(language === 'hi' ? `फाइल बना रहा हूँ: ${filename}` : `Building file: ${filename}`)
                } else if (data.message.startsWith('Estimating size:')) {
                  if (language === 'hi') {
                    const pages = data.message.match(/\((\d+) pages\)/)?.[1] || ''
                    const scaleMatch = data.message.match(/size: (\w+) scale/)?.[1] || 'Medium'
                    const scaleHi = scaleMatch === 'Small' ? 'छोटा' : scaleMatch === 'Large' ? 'बड़ा' : 'मध्यम'
                    setSseMessage(`अनुमानित आकार: ${scaleHi} स्तर (${pages} पेजेज़). योजना बना रहा हूँ...`)
                  } else {
                    setSseMessage(data.message)
                  }
                } else {
                  setSseMessage(data.message)
                }
              } else if (data.type === 'error') {
                setBuildError(data.message || 'Build failed')
                setBuildStage('error')
                isError = true
              } else if (data.type === 'done') {
                setBuildStage('done')
                setBuiltAppId(data.appId)
                setBuiltUrl(data.url)
                currentAppId = data.appId
                isDone = true
              }
            } catch (e) {
              console.warn('Failed to parse SSE line', line)
            }
          }
        }
      }

      if (!isDone && !isError) {
        setBuildError(language === 'hi' ? 'सर्वर कनेक्शन टूट गया। यह आमतौर पर एक टाइमआउट के कारण होता है। कृपया पुनः प्रयास करें।' : 'Server connection dropped unexpectedly (Timeout). The app may still finish building in the background.')
        setBuildStage('error')
      }

      if (currentAppId) {
        setTimeout(() => {
          router.push(`/app/${currentAppId}`)
        }, 2000)
      }
    } catch (e: unknown) {
      setBuildError(e instanceof Error ? e.message : 'Unknown error')
      setBuildStage('error')
    }
  }



  if (!mounted) return null

  // If no spec and not redirected yet, show nothing
  if (!spec) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F4F0] dark:bg-[#1A1917]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E8601A]" />
      </div>
    )
  }

  const stageInfo = STAGE_INFO[buildStage]
  const isBuilding = buildStage !== 'idle' && buildStage !== 'error'

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0]">
      <ShaderBackground />

      <div className="relative z-10">
        <Navigation />

        <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-12 py-16 sm:py-24">
          <motion.div
            initial="initial"
            animate="animate"
            variants={{
              animate: {
                transition: { staggerChildren: 0.1, delayChildren: 0.2 },
              },
            }}
            className="space-y-12"
          >
            {/* Header */}
            <motion.div variants={fadeInUp} className="text-center">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4" style={{ fontFamily: 'var(--font-sora)' }}>
                {t.builder.title}
              </h1>
              <p className="text-base sm:text-lg text-[#6B6560] dark:text-[#9E9890]">
                {t.builder.speakTagline}
              </p>
            </motion.div>

            {/* Spec Summary - Hide if English or building */}
            {language !== 'en' && !isBuilding && (
              <motion.div
                variants={fadeInUp}
                className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 p-6 sm:p-8"
              >
                <h2 className="text-lg font-bold mb-2">
                  {t.builder.detectedSpec}
                </h2>
                <div className="text-sm text-[#6B6560] dark:text-[#9E9890] space-y-1">
                  <p><span className="font-semibold">{t.builder.name}:</span> {spec.nameHindi || spec.name}</p>
                  <p><span className="font-semibold">{t.builder.category}:</span> {spec.category}</p>
                  <p><span className="font-semibold">{t.builder.user}:</span> {spec.userType}</p>
                </div>
              </motion.div>
            )}

            {/* Form Section - Hide if building */}
            {!isBuilding && (
              <motion.div
                variants={fadeInUp}
                className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 p-8 sm:p-12 space-y-6"
              >
                <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-3">
                  <Settings className="w-6 h-6" />
                  {t.builder.appInfo}
                </h2>

                <div>
                  <label className="block text-sm font-semibold mb-3 text-[#1A1917] dark:text-white">
                    {t.builder.appName}
                  </label>
                  <input
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder={t.builder.placeholder}
                    disabled={isBuilding}
                    className="w-full px-5 py-3 rounded-2xl border border-[#E4E1DA] dark:border-white/10 bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-white placeholder-[#6B6560] dark:placeholder-[#9E9890] focus:outline-none focus:ring-2 focus:ring-[#E8601A] transition-all disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-3 text-[#1A1917] dark:text-white">
                    {t.builder.description}
                  </label>
                  <textarea
                    value={appDescription}
                    onChange={(e) => setAppDescription(e.target.value)}
                    placeholder={t.builder.descPlaceholder}
                    rows={4}
                    disabled={isBuilding}
                    className="w-full px-5 py-3 rounded-2xl border border-[#E4E1DA] dark:border-white/10 bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-white placeholder-[#6B6560] dark:placeholder-[#9E9890] focus:outline-none focus:ring-2 focus:ring-[#E8601A] transition-all resize-none disabled:opacity-50"
                  />
                </div>
              </motion.div>
            )}

            {/* Build Progress Indicator */}
            <AnimatePresence>
              {isBuilding && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 p-6 sm:p-8"
                >
                  {/* Progress bar */}
                  <div className="w-full bg-[#F5F4F0] dark:bg-[#1A1917] rounded-full h-2 mb-4">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stageInfo.pct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className={`h-2 rounded-full ${buildStage === 'done' ? 'bg-green-500' : 'bg-[#E8601A]'}`}
                    />
                  </div>

                  {/* Stage label */}
                  <div className="flex items-center gap-3">
                    <div className={`${buildStage === 'done' ? 'text-green-500' : 'text-[#E8601A]'}`}>
                      {stageInfo.icon}
                    </div>
                    <span className="text-sm font-semibold">
                      {language === 'hi' ? stageInfo.labelHi : stageInfo.labelEn}
                    </span>
                  </div>

                  {/* Stage description */}
                  {buildStage !== 'done' && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium text-[#1A1917] dark:text-white">
                        {sseMessage}
                      </p>
                      <p className="text-xs text-[#9E9890]">
                        {language === 'hi'
                          ? 'AI आपके बिज़नेस के लिए कस्टम Next.js ऐप लिख रहा है। इसमें 1-2 मिनट लग सकते हैं...'
                          : 'AI is writing a custom Next.js app for your business. This might take a few minutes for complete build to test process.'}
                      </p>
                    </div>
                  )}

                  {/* Done: show link */}
                  {buildStage === 'done' && builtUrl && (
                    <div className="mt-4 space-y-3">
                      <a
                        href={builtUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#E8601A] hover:underline"
                      >
                        {builtUrl}
                      </a>
                      <p className="text-xs text-[#9E9890]">
                        {language === 'hi' ? 'आपको ऐप पेज पर ले जा रहे हैं...' : 'Redirecting to your app...'}
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Display */}
            {buildError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-red-700 dark:text-red-300 text-sm"
              >
                {buildError}
              </motion.div>
            )}

            {/* Action Buttons */}
            <motion.div
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <motion.button
                id="build-trigger-btn"
                whileHover={buildStage === 'idle' ? { scale: 1.05 } : {}}
                whileTap={buildStage === 'idle' ? { scale: 0.95 } : {}}
                onClick={buildStage === 'idle' ? handleCreateApp : buildStage === 'error' ? () => setBuildStage('idle') : undefined}
                disabled={isBuilding && buildStage !== 'done'}
                className={`flex items-center justify-center gap-3 px-8 py-4 rounded-full font-semibold transition-all shadow-lg disabled:opacity-60 ${
                  buildStage === 'done'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : buildStage === 'error'
                    ? 'bg-[#E8601A] hover:bg-[#C94E12] text-white'
                    : 'bg-[#E8601A] hover:bg-[#C94E12] text-white'
                }`}
              >
                {stageInfo.icon}
                {buildStage === 'error'
                  ? (language === 'hi' ? 'फिर से कोशिश करें' : 'Try Again')
                  : buildStage === 'done'
                  ? (language === 'hi' ? 'ऐप देखें' : 'View App')
                  : isBuilding
                  ? (language === 'hi' ? stageInfo.labelHi : stageInfo.labelEn)
                  : t.builder.createApp}
              </motion.button>

              {buildStage === 'idle' && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push('/dashboard')}
                  className="flex items-center justify-center gap-3 px-8 py-4 border-2 border-[#E4E1DA] dark:border-white/10 text-[#1A1917] dark:text-white rounded-full font-semibold hover:bg-[#F5F4F0] dark:hover:bg-white/5 transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                  {t.builder.cancel}
                </motion.button>
              )}

              {buildStage === 'done' && builtAppId && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push(`/app/${builtAppId}`)}
                  className="flex items-center justify-center gap-3 px-8 py-4 bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-full font-semibold transition-all shadow-lg"
                >
                  <Zap className="w-5 h-5" />
                  {language === 'hi' ? 'ऐप कंट्रोल हब' : 'Go to App Hub'}
                </motion.button>
              )}
            </motion.div>
          </motion.div>
        </div>

        <footer className="border-t border-[#E4E1DA] dark:border-white/10 py-12 sm:py-16 px-5 sm:px-8 lg:px-12">
          <div className="max-w-6xl mx-auto text-center text-sm text-[#6B6560] dark:text-[#9E9890]">
            <p>© 2026 MAYA. {t.builder.allRights}</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
