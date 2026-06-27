'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLanguage } from '@/app/providers'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ExternalLink, RefreshCw, Loader2, Search,
  Monitor, Tablet, Smartphone, MessageSquare, Eye,
  ChevronDown, Pencil, Settings, Trash2, X, Check,
} from 'lucide-react'
import { AppChat } from '@/components/app-chat'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewportMode = 'desktop' | 'tablet' | 'mobile'

const VP: Record<ViewportMode, { w: string; max: string; icon: typeof Monitor }> = {
  desktop: { w: '100%', max: '100%', icon: Monitor },
  tablet:  { w: '768px', max: '768px', icon: Tablet },
  mobile:  { w: '375px', max: '375px', icon: Smartphone },
}

const PHRASES = [
  "Cookin\u2019 up something fresh",
  'Wiring the circuits',
  'Thinking in components',
  'Painting pixels',
  'Sculpting the UI',
  'Almost there\u2026',
]

interface AppMessage { role: 'user' | 'assistant'; content: string; timestamp: number }

interface AppData {
  id: string; name: string; nameHindi?: string; descriptionEn?: string
  category: string; url: string; projectId: string; deploymentId?: string
  createdAt: string; status: 'live' | 'building' | 'evolving' | 'preview'
  adminUsername?: string; adminPin?: string; shownToOwner?: boolean
  messages?: AppMessage[]; version?: number
}

// ═════════════════════════════════════════════════════════════════════════════
// AppDetailPage — v0-style build page
//
//   ┌────────────── 100dvh ──────────────┐
//   │  TOP BAR  (h-11)                    │
//   ├──────────────┬──┬──────────────────-┤
//   │  CHAT (30%)  │||│  PREVIEW (70%)    │
//   │  scroll ↕    │  │  iframe ↕         │
//   │  ──────────  │  │                   │
//   │  input (fix) │  │                   │
//   └──────────────┴──┴──────────────────-┘
// ═════════════════════════════════════════════════════════════════════════════

export default function AppDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { language } = useLanguage()
  const appId = params.id as string

  const [mounted, setMounted] = useState(false)
  const [app, setApp] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)

  // Iframe
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)

  // Build
  const [isBuilding, setIsBuilding] = useState(false)
  const [buildMessages, setBuildMessages] = useState<string[]>([])
  const [buildError, setBuildError] = useState<string | null>(null)

  // Viewport
  const [viewport, setViewport] = useState<ViewportMode>('desktop')

  // Deploy
  const [isPromoting, setIsPromoting] = useState(false)
  const [promoteError, setPromoteError] = useState<string | null>(null)

  // Mobile
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat')
  const [isMobile, setIsMobile] = useState(false)

  // Build phrases
  const [phraseIdx, setPhraseIdx] = useState(0)

  // Dropdowns
  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const [showVersionMenu, setShowVersionMenu] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const versionMenuRef = useRef<HTMLDivElement>(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) setShowProjectMenu(false)
      if (versionMenuRef.current && !versionMenuRef.current.contains(e.target as Node)) setShowVersionMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  useEffect(() => {
    setMounted(true)
    try {
      const raw = localStorage.getItem('maya-app-spec')
      if (raw) {
        const s = JSON.parse(raw)
        if (s.appId === appId) {
          localStorage.removeItem('maya-app-spec')
          setIsBuilding(true); setIsDeploying(true); setLoading(false)
          setApp({ id: appId, name: s.name || 'New App', nameHindi: s.nameHindi, descriptionEn: s.descriptionEn, category: s.category || 'other', url: '', projectId: '', createdAt: new Date().toISOString(), status: 'building', version: 1 })
          handleBuild(s)
          return
        }
      }
    } catch { /* */ }
    fetchApp()
  }, [appId])

  useEffect(() => {
    if (!isBuilding) return
    const i = setInterval(() => setPhraseIdx(p => (p + 1) % PHRASES.length), 3000)
    return () => clearInterval(i)
  }, [isBuilding])

  // ── Build (SSE) ────────────────────────────────────────────────────────────

  async function handleBuild(spec: any, retry = 0, partial = '', chunks = 0) {
    const add = (m: string) => setBuildMessages(p => [...p, m])
    if (retry === 0) { if (spec.descriptionEn) add(`[USER] ${spec.descriptionEn}`); add(`Setting up ${spec.name}...`) }
    let raw = partial, stage = 'preparing', done = false, err = false

    try {
      const res = await fetch('/api/build', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, partialContent: partial, spec: { ...spec, name: spec.name, descriptionEn: spec.descriptionEn } }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setBuildError(b.error || `Build failed: ${res.status}`); add(`Build failed: ${b.error || res.status}`); setIsBuilding(false); return }
      const reader = res.body?.getReader(); if (!reader) throw new Error('No stream')
      const dec = new TextDecoder()
      while (true) {
        const { done: d, value } = await reader.read(); if (d) break
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'stage') { stage = data.stage; if (data.stage === 'generating') add('AI is writing your code...'); if (data.stage === 'deploying') add('Code done! Deploying...') }
            else if (data.type === 'chunk') { raw += data.text }
            else if (data.type === 'progress') {
              if (data.message.includes('Retrying')) add('Polishing rough edges...')
              else if (data.message.includes('Compiler error') || data.message.includes('Build error')) add('Fixing a build issue...')
              else if (data.message.includes('Auto-fixed')) add(data.message)
              else if (data.message.includes('Re-deploying')) add('Re-deploying with fixes...')
            }
            else if (data.type === 'error') { setBuildError(data.message); add(data.message); err = true }
            else if (data.type === 'preview_ready' || data.type === 'done') {
              done = true; add('Your app preview is ready!')
              setApp(p => p ? { ...p, status: 'preview', url: data.url } : null)
              if (data.url) { setIsDeploying(false); setIframeUrl(data.url) }
            }
          } catch { /* */ }
        }
      }
      if (!done && !err) {
        if (stage === 'deploying') { add('Deployment in progress...'); done = true; fetchApp() }
        else if (retry < 10) { add('Retrying...'); setTimeout(() => handleBuild(spec, retry + 1, raw, chunks), 2000); return }
        else { setBuildError('Build timed out'); add('Build timed out') }
      }
    } catch {
      if (stage === 'deploying') { add('Checking deployment...'); done = true; fetchApp() }
      else if (retry < 10) { add('Retrying...'); setTimeout(() => handleBuild(spec, retry + 1, raw, chunks), 2000); return }
      else { setBuildError('Build failed'); add('Build failed') }
    } finally { if (done || err) setIsBuilding(false) }
  }

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchApp = async () => {
    try {
      const r = await fetch(`/api/apps/${appId}`); if (!r.ok) throw new Error()
      const { app: f } = await r.json()
      if (f) {
        setApp({ id: f.id, name: f.name, nameHindi: f.nameHindi, descriptionEn: f.descriptionEn, category: f.category, url: f.url || '', projectId: f.projectId || '', deploymentId: f.deploymentId, createdAt: f.createdAt || new Date().toISOString(), status: f.status || 'live', adminUsername: f.adminUsername, adminPin: f.adminPin, shownToOwner: f.shownToOwner, messages: f.messages || [], version: f.version || 1 })
        if (f.status === 'building') {
          if (!isBuilding) { setIsBuilding(true); setIsDeploying(true); setBuildMessages(p => p.length === 0 ? [f.descriptionEn ? `[USER] ${f.descriptionEn}` : '', `Setting up ${f.name}...`, 'AI is writing your code...'].filter(Boolean) : p) }
          setTimeout(() => fetchApp(), 5000)
        } else if (f.status === 'preview' || f.status === 'live') {
          if (isBuilding) { setIsBuilding(false); setBuildMessages(p => [...p, f.status === 'preview' ? 'Your app preview is ready!' : 'Your app is live!']) }
          if (f.url) { setIsDeploying(false); setIframeUrl(f.url) }
        } else if (f.url) { setIsDeploying(false); setIframeUrl(f.url) }
        if (f.adminPin && !f.shownToOwner) setTimeout(() => fetch(`/api/apps/${f.id}`, { method: 'PATCH' }).catch(() => {}), 2000)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const handleEditSuccess = useCallback((url: string) => {
    setIframeLoaded(false); setIframeUrl(null)
    setApp(p => p ? { ...p, version: (p.version || 1) + 1 } : null)
    setTimeout(() => setIframeUrl(url + (url.includes('?') ? '&' : '?') + `_t=${Date.now()}`), 2000)
  }, [])

  const handleDeployLive = useCallback(async () => {
    if (!app || isPromoting) return
    setIsPromoting(true); setPromoteError(null)
    try {
      const r = await fetch('/api/promote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: app.id }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed')
      const d = await r.json()
      setApp(p => p ? { ...p, status: 'live', url: d.url } : null)
      if (d.url) { setIframeLoaded(false); setIframeUrl(null); setTimeout(() => setIframeUrl(d.url), 1000) }
    } catch (e) { setPromoteError(e instanceof Error ? e.message : String(e)) }
    finally { setIsPromoting(false) }
  }, [app, isPromoting])

  // ── Rename ─────────────────────────────────────────────────────────────────

  const handleRename = async () => {
    if (!renameValue.trim() || !app) return
    try {
      await fetch(`/api/apps/${app.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      })
      setApp(p => p ? { ...p, name: renameValue.trim() } : null)
    } catch { /* */ }
    setIsRenaming(false)
    setShowProjectMenu(false)
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!app) return
    try {
      await fetch(`/api/apps/${app.id}`, { method: 'DELETE' })
      router.push('/dashboard')
    } catch { /* */ }
  }

  if (!mounted) return null

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="h-[100dvh] bg-[#111110] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-9 h-9">
          <div className="absolute inset-0 border-2 border-[#E8601A]/15 rounded-full" />
          <div className="absolute inset-0 border-2 border-[#E8601A] rounded-full border-t-transparent animate-spin" />
        </div>
        <p className="text-[11px] text-[#3A3835]">{language === 'hi' ? 'लोड हो रहा है...' : 'Loading...'}</p>
      </div>
    </div>
  )

  // ── 404 ────────────────────────────────────────────────────────────────────

  if (!app && !isBuilding) return (
    <div className="h-[100dvh] bg-[#111110] flex flex-col items-center justify-center text-center px-4">
      <Search className="w-7 h-7 text-[#E8601A] mb-3" strokeWidth={1.5} />
      <h2 className="text-base font-semibold mb-1 text-[#F5F4F0]" style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}>{language === 'hi' ? 'ऐप नहीं मिला' : 'App Not Found'}</h2>
      <p className="text-[13px] text-[#3A3835] mb-4">{language === 'hi' ? 'यह ऐप मौजूद नहीं है।' : 'This app does not exist.'}</p>
      <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1 text-[#E8601A] text-[13px] font-medium cursor-pointer"><ArrowLeft className="w-3.5 h-3.5" />{language === 'hi' ? 'वापस जाएं' : 'Go back'}</button>
    </div>
  )

  // ── Derived ────────────────────────────────────────────────────────────────

  const statusDot = app?.status === 'live' ? 'bg-emerald-400' : app?.status === 'preview' ? 'bg-[#E8601A]' : 'bg-amber-400'
  const vp = VP[viewport]
  const version = app?.version || 1

  // Build panel data is now passed to AppChat via buildMode props

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════════

  return (
    <div className="h-[100dvh] w-screen bg-[#111110] flex flex-col overflow-hidden text-[#F5F4F0]">

      {/* ═══ TOP BAR (44px) ═══════════════════════════════════════════════ */}
      <header className="h-11 flex items-center justify-between px-2.5 border-b border-white/[0.06] bg-[#1A1917] shrink-0 z-30">

        {/* ── Left: back + project name dropdown + status ────────────── */}
        <div className="flex items-center gap-1 min-w-0">
          <button onClick={() => router.push('/dashboard')} className="p-1.5 rounded-md text-[#4A4742] hover:text-[#F5F4F0] hover:bg-white/[0.05] transition-all shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Project name + dropdown */}
          <div className="relative" ref={projectMenuRef}>
            <button
              onClick={() => { setShowProjectMenu(!showProjectMenu); setShowVersionMenu(false) }}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/[0.04] transition-colors min-w-0 group"
            >
              <span className="text-[13px] font-medium text-[#F5F4F0] truncate max-w-[200px]" style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}>
                {language === 'hi' && app?.nameHindi ? app.nameHindi : app?.name || 'New App'}
              </span>
              <ChevronDown className={`w-3 h-3 text-[#6B6560] group-hover:text-[#9E9890] shrink-0 transition-transform ${showProjectMenu ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown menu */}
            <AnimatePresence>
              {showProjectMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="absolute top-full left-0 mt-1 w-48 bg-[#222120] rounded-lg ring-1 ring-white/[0.08] shadow-xl shadow-black/40 py-1 z-50"
                >
                  {isRenaming ? (
                    <div className="px-2 py-1.5 flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setIsRenaming(false); setShowProjectMenu(false) } }}
                        className="flex-1 bg-[#1A1917] rounded-md px-2 py-1 text-[12px] text-[#F5F4F0] border border-white/[0.08] outline-none focus:border-[#E8601A]/40 min-w-0"
                        placeholder="App name..."
                      />
                      <button onClick={handleRename} className="p-1 text-emerald-400 hover:bg-white/[0.05] rounded"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { setIsRenaming(false); setShowProjectMenu(false) }} className="p-1 text-[#4A4742] hover:bg-white/[0.05] rounded"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { setIsRenaming(true); setRenameValue(app?.name || '') }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#D4D0CA] hover:bg-white/[0.05] transition-colors text-left"
                      >
                        <Pencil className="w-3.5 h-3.5 text-[#6B6560]" />
                        {language === 'hi' ? 'नाम बदलें' : 'Rename'}
                      </button>
                      <button
                        onClick={() => setShowProjectMenu(false)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#D4D0CA] hover:bg-white/[0.05] transition-colors text-left"
                      >
                        <Settings className="w-3.5 h-3.5 text-[#6B6560]" />
                        {language === 'hi' ? 'सेटिंग्स' : 'Settings'}
                      </button>
                      <div className="h-px bg-white/[0.06] my-1" />
                      {showDeleteConfirm ? (
                        <div className="px-3 py-2 space-y-2">
                          <p className="text-[11px] text-red-400">{language === 'hi' ? 'क्या आप पक्का डिलीट करना चाहते हैं?' : 'Delete this app permanently?'}</p>
                          <div className="flex gap-1.5">
                            <button onClick={handleDelete} className="flex-1 px-2 py-1 text-[11px] bg-red-500/15 text-red-400 rounded-md hover:bg-red-500/25 transition-colors">{language === 'hi' ? 'हाँ, डिलीट करें' : 'Yes, delete'}</button>
                            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-2 py-1 text-[11px] bg-white/[0.05] text-[#6B6560] rounded-md hover:bg-white/[0.08] transition-colors">{language === 'hi' ? 'रद्द करें' : 'Cancel'}</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-red-400/80 hover:bg-red-500/[0.06] transition-colors text-left"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {language === 'hi' ? 'डिलीट करें' : 'Delete'}
                        </button>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Status dot */}
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <div className={`w-1.5 h-1.5 rounded-full ${statusDot} ${app?.status !== 'live' ? 'animate-pulse' : ''}`} />
            <span className="text-[10px] text-[#6B6560] uppercase tracking-wider font-medium">
              {app?.status === 'live' ? 'Live' : app?.status === 'preview' ? 'Preview' : 'Building'}
            </span>
          </div>
        </div>

        {/* ── Center: viewport switcher ───────────────────────────────── */}
        {!isMobile && (
          <div className="flex items-center">
            <div className="flex items-center bg-white/[0.02] ring-1 ring-white/[0.04] rounded-lg p-0.5">
              {(Object.keys(VP) as ViewportMode[]).map((mode) => {
                const Icon = VP[mode].icon
                return (
                  <button key={mode} onClick={() => setViewport(mode)} className={`p-1.5 rounded-md transition-colors ${viewport === mode ? 'bg-[#E8601A]/10 text-[#E8601A]' : 'text-[#6B6560] hover:text-white'}`}>
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Right: version badge + publish ──────────────────────────── */}
        <div className="flex items-center gap-2 shrink-0">
          {promoteError && <span className="text-[9px] text-red-400 max-w-[100px] truncate">{promoteError}</span>}

          {/* Version badge */}
          <div className="relative" ref={versionMenuRef}>
            <button
              onClick={() => { setShowVersionMenu(!showVersionMenu); setShowProjectMenu(false) }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#9E9890] hover:text-white hover:bg-white/[0.04] transition-colors font-medium"
            >
              v{version}
              <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showVersionMenu ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showVersionMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="absolute top-full right-0 mt-1 w-52 bg-[#222120] rounded-lg ring-1 ring-white/[0.08] shadow-xl shadow-black/40 py-1 z-50"
                >
                  {/* Current version */}
                  <div className="px-3 py-2 flex items-center justify-between">
                    <div>
                      <div className="text-[12px] text-[#F5F4F0] font-medium">Version {version}</div>
                      <div className="text-[10px] text-[#3A3835] mt-0.5">{app?.createdAt ? new Date(app.createdAt).toLocaleDateString() : ''}</div>
                    </div>
                    {app?.status === 'live' && (
                      <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        <div className="w-1 h-1 rounded-full bg-emerald-400" />
                        Deployed
                      </span>
                    )}
                  </div>

                  {/* Previous version */}
                  {version > 1 && (
                    <>
                      <div className="h-px bg-white/[0.06]" />
                      <button className="w-full px-3 py-2 text-left hover:bg-white/[0.04] transition-colors">
                        <div className="text-[12px] text-[#9E9890]">Version {version - 1}</div>
                        <div className="text-[10px] text-[#3A3835] mt-0.5">{language === 'hi' ? 'पिछला संस्करण' : 'Previous version'}</div>
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Publish / Published */}
          {app?.status !== 'live' ? (
            <button
              onClick={app?.status === 'preview' ? handleDeployLive : undefined}
              disabled={isBuilding || isPromoting || app?.status !== 'preview'}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold rounded-lg transition-all ${
                isBuilding
                  ? 'bg-amber-500/[0.06] text-amber-400/80 ring-1 ring-amber-500/10 cursor-default'
                  : app?.status === 'preview'
                    ? 'bg-[#E8601A] text-white hover:bg-[#C94E12] cursor-pointer'
                    : 'bg-white/[0.03] text-[#2A2925] cursor-not-allowed'
              } disabled:cursor-not-allowed`}
            >
              {isBuilding ? <><Loader2 className="w-3 h-3 animate-spin" />{language === 'hi' ? 'बिल्ड' : 'Building'}</>
                : isPromoting ? <><Loader2 className="w-3 h-3 animate-spin" />{language === 'hi' ? 'डिप्लॉय' : 'Deploying'}</>
                : language === 'hi' ? 'पब्लिश करें' : 'Publish'}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-500/[0.06] text-emerald-400 ring-1 ring-emerald-500/10">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {language === 'hi' ? 'पब्लिश' : 'Published'}
            </div>
          )}
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isMobile ? (
          /* ── MOBILE ────────────────────────────────────────────────── */
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0 overflow-hidden">
              {mobileTab === 'chat' ? (
                <div className="h-full"><AppChat app={app!} onUpdate={fetchApp} onEditSuccess={handleEditSuccess} buildMode={isBuilding} buildMessages={buildMessages} buildError={buildError} buildPhrase={isBuilding ? PHRASES[phraseIdx] : undefined} /></div>
              ) : (
                <div className="h-full bg-[#111110] flex flex-col overflow-hidden">
                  <div className="flex-1 min-h-0 relative">
                    {iframeUrl ? <iframe src={iframeUrl} className="absolute inset-0 w-full h-full border-0 bg-white" onLoad={() => setIframeLoaded(true)} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title={app?.name || 'Preview'} />
                      : <div className="flex items-center justify-center h-full"><Loader2 className="w-5 h-5 animate-spin text-[#E8601A]" /></div>}
                  </div>
                  {iframeUrl && <div className="px-3 py-1.5 bg-[#1A1917] border-t border-white/[0.06] flex items-center gap-2 shrink-0"><span className="flex-1 truncate text-[10px] text-[#3A3835] font-mono">{iframeUrl.split('?')[0]}</span><a href={iframeUrl.split('?')[0]} target="_blank" rel="noreferrer"><ExternalLink className="w-3 h-3 text-[#3A3835]" /></a></div>}
                </div>
              )}
            </div>
            <div className="flex bg-[#1A1917] border-t border-white/[0.06] shrink-0">
              <button onClick={() => setMobileTab('chat')} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${mobileTab === 'chat' ? 'text-[#E8601A]' : 'text-[#6B6560]'}`}><MessageSquare className="w-4 h-4" /><span className="text-[9px] font-medium">{language === 'hi' ? 'चैट' : 'Chat'}</span></button>
              <button onClick={() => setMobileTab('preview')} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${mobileTab === 'preview' ? 'text-[#E8601A]' : 'text-[#6B6560]'}`}><Eye className="w-4 h-4" /><span className="text-[9px] font-medium">{language === 'hi' ? 'प्रीव्यू' : 'Preview'}</span></button>
            </div>
          </div>
        ) : (
          /* ── DESKTOP ───────────────────────────────────────────────── */
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={30} minSize={18} maxSize={50}>
              <div className="h-full overflow-hidden"><AppChat app={app!} onUpdate={fetchApp} onEditSuccess={handleEditSuccess} buildMode={isBuilding} buildMessages={buildMessages} buildError={buildError} buildPhrase={isBuilding ? PHRASES[phraseIdx] : undefined} /></div>
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={70}>
              <div className="h-full bg-[#111110] flex flex-col overflow-hidden">
                {/* Browser chrome */}
                <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#161514] border-b border-white/[0.06] shrink-0">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
                  </div>
                  <div className="flex-1 flex items-center gap-1.5">
                    <button onClick={() => { setIframeLoaded(false); const c = iframeUrl; setIframeUrl(null); setTimeout(() => setIframeUrl(c), 50) }} disabled={!iframeUrl} className="p-0.5 text-[#6B6560] hover:text-white rounded transition-colors disabled:opacity-25">
                      <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    <div className="flex-1 px-2.5 py-[3px] bg-[#1A1917] ring-1 ring-white/[0.04] rounded-md text-[10px] text-[#6B6560] truncate font-mono">
                      {iframeUrl?.split('?')[0] || (language === 'hi' ? 'डिप्लॉयमेंट का इंतज़ार...' : 'Waiting for deployment...')}
                    </div>
                    {iframeUrl && <a href={iframeUrl.split('?')[0]} target="_blank" rel="noopener noreferrer" className="p-0.5 text-[#6B6560] hover:text-white rounded transition-colors"><ExternalLink className="w-3 h-3" strokeWidth={1.5} /></a>}
                  </div>
                </div>

                {/* Iframe viewport */}
                <div className="flex-1 min-h-0 relative bg-[#0A0A09] overflow-hidden flex items-start justify-center">
                  <AnimatePresence mode="wait">
                    {isDeploying ? (
                      <motion.div key="deploy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center bg-[#111110] z-10">
                        {isBuilding ? (
                          <div className="w-full max-w-sm p-6 space-y-4 animate-pulse">
                            <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-[#1A1917]" /><div className="flex-1 space-y-1.5"><div className="h-3 bg-[#1A1917] rounded w-32" /><div className="h-2.5 bg-[#1A1917] rounded w-20" /></div></div>
                            <div className="grid grid-cols-3 gap-2.5">{[1,2,3].map(i => <div key={i} className="h-16 rounded-lg bg-[#1A1917]" />)}</div>
                            <div className="h-28 rounded-lg bg-[#1A1917]/60" />
                            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 rounded-md bg-[#1A1917]/40" style={{ width: `${90 - i * 12}%` }} />)}</div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3"><Loader2 className="w-5 h-5 animate-spin text-[#E8601A]" /><p className="text-[11px] text-[#3A3835]">{language === 'hi' ? 'डिप्लॉय हो रहा है...' : 'Deploying...'}</p></div>
                        )}
                      </motion.div>
                    ) : !iframeLoaded && iframeUrl ? (
                      <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex items-center justify-center bg-[#111110] z-10">
                        <Loader2 className="w-5 h-5 animate-spin text-[#E8601A]" />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {iframeUrl && (
                    <div className="h-full transition-all duration-300 ease-out" style={{ width: viewport === 'desktop' ? '100%' : vp.max, maxWidth: vp.max }}>
                      <div className={`h-full mx-auto transition-all duration-300 ease-out ${viewport !== 'desktop' ? 'my-3 rounded-xl ring-1 ring-white/[0.06] shadow-2xl overflow-hidden' : ''}`} style={{ width: viewport === 'desktop' ? '100%' : vp.w, maxWidth: vp.max }}>
                        <iframe src={iframeUrl} className="w-full h-full border-0 bg-white" onLoad={() => setIframeLoaded(true)} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title={app?.name || 'Preview'} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}
