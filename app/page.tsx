'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ─── Multi-language MAYA names ───────────────────────────────────────────────
const MAYA_SCRIPTS = [
  { text: 'MAYA', lang: 'en' },
  { text: 'माया', lang: 'hi' },
  { text: 'మాయ', lang: 'te' },
  { text: 'மாயா', lang: 'ta' },
  { text: 'ਮਾਇਆ', lang: 'pa' },
  { text: 'মায়া', lang: 'bn' },
  { text: 'മായ', lang: 'ml' },
]

const CYCLE_INTERVAL = 2200

// ─── Web Speech API types ────────────────────────────────────────────────────
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}
interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: SpeechRecognitionResult
}
interface SpeechRecognitionResult {
  readonly length: number
  readonly isFinal: boolean
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null
  onend: ((ev: Event) => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [currentScriptIdx, setCurrentScriptIdx] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isMicActive, setIsMicActive] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const finalTranscriptRef = useRef('')
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasSpokenRef = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Planning-first UX state
  const [planState, setPlanState] = useState<'idle' | 'streaming' | 'ready'>('idle')
  const [planText, setPlanText] = useState('')
  const [planData, setPlanData] = useState<any>(null)
  const [submittedPrompt, setSubmittedPrompt] = useState('')
  const [thinkingText, setThinkingText] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [thinkDuration, setThinkDuration] = useState(0)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)
  const thinkStartRef = useRef(Date.now())
  const planAbortRef = useRef<AbortController | null>(null)

  // ─── Model tier selector ────────────────────────────────────────────────────
  type MayaTier = { label: string; model: string; provider: string; description: string; inputPrice: string; outputPrice: string }
  const DEFAULT_TIERS: MayaTier[] = [
    { label: 'Maya Mini', model: 'stepfun-ai/step-3.7-flash', provider: 'NvidiaNIM', description: 'Fast & light', inputPrice: '$0.25', outputPrice: '$1.25' },
    { label: 'Maya Balanced', model: 'deepseek-ai/deepseek-v4-flash', provider: 'NvidiaNIM', description: 'Balanced', inputPrice: '$0.50', outputPrice: '$2.00' },
    { label: 'Maya Max', model: 'minimaxai/minimax-m3', provider: 'NvidiaNIM', description: 'Most capable', inputPrice: '$1.00', outputPrice: '$4.00' },
  ]
  const [mayaTiers, setMayaTiers] = useState<MayaTier[]>(DEFAULT_TIERS)
  const [selectedTier, setSelectedTier] = useState(1) // Default: Maya Balanced
  const [showTierMenu, setShowTierMenu] = useState(false)
  const tierBtnRef = useRef<HTMLButtonElement>(null)
  const tierMenuRef = useRef<HTMLDivElement>(null)

  // Fetch live model tiers
  useEffect(() => {
    fetch('/api/maya-models')
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        const providerMap: Record<string, string> = {
          'nvidia-nim': 'NvidiaNIM', 'anthropic': 'Anthropic',
          'openai': 'OpenAI', 'google': 'Google', 'groq': 'Groq',
        }
        const mapProv = (p: string) => providerMap[p.toLowerCase()] ?? p
        setMayaTiers([
          { label: 'Maya Mini', model: data.mini.model, provider: mapProv(data.mini.provider), description: 'Fast & light', inputPrice: '$0.25', outputPrice: '$1.25' },
          { label: 'Maya Balanced', model: data.fast.model, provider: mapProv(data.fast.provider), description: 'Balanced', inputPrice: '$0.50', outputPrice: '$2.00' },
          { label: 'Maya Max', model: data.max.model, provider: mapProv(data.max.provider), description: 'Most capable', inputPrice: '$1.00', outputPrice: '$4.00' },
        ])
      })
      .catch(() => {})
  }, [])

  // Close tier menu on outside click
  useEffect(() => {
    if (!showTierMenu) return
    const handler = (e: MouseEvent) => {
      if (tierMenuRef.current && !tierMenuRef.current.contains(e.target as Node) &&
          tierBtnRef.current && !tierBtnRef.current.contains(e.target as Node)) {
        setShowTierMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTierMenu])

  const activeTier = mayaTiers[selectedTier] ?? mayaTiers[0]

  const isPlanning = planState !== 'idle'

  // Track thinking duration
  useEffect(() => {
    if (isThinking) {
      thinkStartRef.current = Date.now()
      setThinkDuration(0)
      const interval = setInterval(() => {
        setThinkDuration(Math.round((Date.now() - thinkStartRef.current) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    } else if (thinkingText) {
      // Freeze duration when thinking ends
      setThinkDuration(prev => prev || Math.round((Date.now() - thinkStartRef.current) / 1000) || 1)
    }
  }, [isThinking])

  useEffect(() => { setMounted(true) }, [])

  // Multi-language cycling (only when idle)
  useEffect(() => {
    if (!mounted || isPlanning) return
    const timer = setInterval(() => {
      setIsTransitioning(true)
      setTimeout(() => {
        setCurrentScriptIdx((prev) => (prev + 1) % MAYA_SCRIPTS.length)
        setIsTransitioning(false)
      }, 400)
    }, CYCLE_INTERVAL)
    return () => clearInterval(timer)
  }, [mounted, isPlanning])

  // Auto-expand textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [prompt])

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (isPlanning) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [planText, planData, isPlanning])

  const SILENCE_TIMEOUT_MS = 2200

  // ── Voice ──────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SpeechRecognition = window?.SpeechRecognition || window?.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition
    finalTranscriptRef.current = prompt
    hasSpokenRef.current = false

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        if (hasSpokenRef.current && finalTranscriptRef.current.trim()) {
          console.log('[mic] Auto-stopping: silence detected')
          if (recognitionRef.current) {
            try { recognitionRef.current.stop() } catch { /* */ }
            recognitionRef.current = null
          }
          setIsMicActive(false)
          // Auto-submit through the plan-first flow
          setTimeout(() => {
            const text = finalTranscriptRef.current.trim()
            if (text) {
              setPrompt(text)
              setTimeout(() => {
                document.querySelector<HTMLFormElement>('form')?.requestSubmit()
              }, 50)
            }
          }, 300)
        }
      }, SILENCE_TIMEOUT_MS)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let finalPart = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalPart += result[0].transcript + ' '
          hasSpokenRef.current = true
        } else {
          interim += result[0].transcript
        }
      }

      if (finalPart) {
        finalTranscriptRef.current += finalPart
        setPrompt(finalTranscriptRef.current + interim)
      } else {
        setPrompt(finalTranscriptRef.current + interim)
      }

      resetSilenceTimer()
    }

    recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
      console.error('[mic] Error:', ev.error)
      if (ev.error !== 'no-speech') {
        setIsMicActive(false)
        recognitionRef.current = null
      }
    }

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }

    recognition.start()
    setIsMicActive(true)
    resetSilenceTimer()
  }, [prompt])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* */ }
      recognitionRef.current = null
    }
    setIsMicActive(false)
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const handleMicToggle = useCallback(() => {
    if (isMicActive) {
      stopListening()
    } else {
      startListening()
    }
  }, [isMicActive, startListening, stopListening])

  // ── Submit → Plan-first chat flow ──────────────────────────────────────────
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!prompt.trim()) return
    stopListening()

    const userPrompt = prompt.trim()
    setSubmittedPrompt(userPrompt)
    setPrompt('') // Clear input after sending
    setPlanState('streaming')
    setPlanText('')
    setPlanData(null)
    setThinkingText('')
    setIsThinking(false)

    const controller = new AbortController()
    planAbortRef.current = controller

    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt }),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        window.location.href = `/workbench?prompt=${encodeURIComponent(userPrompt)}&model=${encodeURIComponent(activeTier.model)}&provider=${encodeURIComponent(activeTier.provider)}&tierIdx=${selectedTier}`
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let inThinkBlock = false
      let thinkContent = ''
      let planContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })

        // Parse <think> blocks for thinking display
        // Check if we're inside a <think> block
        const thinkStart = accumulated.indexOf('<think>')
        const thinkEnd = accumulated.indexOf('</think>')

        if (thinkStart !== -1 && thinkEnd === -1) {
          // Still inside thinking
          inThinkBlock = true
          thinkContent = accumulated.slice(thinkStart + 7)
          setThinkingText(thinkContent)
          setIsThinking(true)
          planContent = ''
        } else if (thinkStart !== -1 && thinkEnd !== -1) {
          // Thinking complete
          thinkContent = accumulated.slice(thinkStart + 7, thinkEnd)
          setThinkingText(thinkContent)
          setIsThinking(false)
          inThinkBlock = false
          planContent = accumulated.slice(thinkEnd + 8).trim()
          setPlanText(planContent)
        } else if (!inThinkBlock) {
          planContent = accumulated
          setPlanText(accumulated)
        }
      }

      // Try to parse the JSON
      try {
        let jsonStr = (planContent || accumulated).trim()
        // Remove think blocks
        jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
        if (jsonMatch) jsonStr = jsonMatch[0]
        const parsed = JSON.parse(jsonStr)
        setPlanData(parsed)
        setPlanState('ready')
      } catch {
        setPlanState('ready')
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setPlanState('idle')
        return
      }
      window.location.href = `/workbench?prompt=${encodeURIComponent(prompt.trim())}&model=${encodeURIComponent(activeTier.model)}&provider=${encodeURIComponent(activeTier.provider)}&tierIdx=${selectedTier}`
    }
  }, [prompt, stopListening, activeTier, selectedTier])

  const handleApprove = useCallback(() => {
    if (planData) {
      sessionStorage.setItem('maya-plan', JSON.stringify(planData))
    }
    const planName = planData?.name || ''
    const submittedPromptStr = submittedPrompt || prompt.trim() || ''

    // Mint the appId HERE on the client so the redirect to /workbench/[id] is
    // instant — no waiting for the LLM to come back with one. The Convex row
    // for this appId is created lazily by /api/apps-from-plan in the background
    // (it may fail and we already-redirected; that's fine — the workbench page
    // shows a preparing/connected state on missing rows).
    const appId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

    const params = new URLSearchParams()
    // appId lives in the URL path; query only carries UX context.
    params.set('prompt', submittedPromptStr)
    if (planName) params.set('name', planName)
    params.set('model', activeTier.model)
    params.set('provider', activeTier.provider)
    params.set('tierIdx', String(selectedTier))

    const dest = `/workbench/${appId}?${params.toString()}`

    // Navigate immediately — the workbench page subscribes and shows
    // 'preparing' until the Convex row is created by the post-fire below.
    window.location.href = dest

    // Fire-and-forget the POST that creates the Convex shell + LLM plan.
    // No await — this runs in the background of the navigation.
    fetch('/api/apps-from-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: submittedPromptStr, preallocatedAppId: appId }),
    }).catch((e) => {
      console.warn('[approve] background apps-from-plan failed', e)
    })
  }, [prompt, submittedPrompt, planData, activeTier, selectedTier])

  const handleStartOver = useCallback(() => {
    planAbortRef.current?.abort()
    setPlanState('idle')
    setPlanText('')
    setPlanData(null)
    setSubmittedPrompt('')
    setThinkingText('')
    setIsThinking(false)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch { /* */ }
        recognitionRef.current = null
      }
    }
  }, [])

  if (!mounted) return <div className="min-h-[100dvh] bg-[#F5F4F0] dark:bg-[#1A1917]" />

  const currentScript = MAYA_SCRIPTS[currentScriptIdx]

  // Build markdown for plan display
  const buildPlanMarkdown = (plan: any): string => {
    let md = `## ${plan.name || 'App Plan'}\n\n`
    if (plan.description) md += `${plan.description}\n\n`
    if (plan.features?.length) {
      md += `### Features\n`
      plan.features.forEach((f: string) => { md += `- ${f}\n` })
      md += `\n`
    }
    if (plan.techStack?.length) {
      md += `**Tech Stack:** ${plan.techStack.join(' · ')}\n\n`
    }
    if (plan.pages?.length) {
      md += `**Pages:** ${plan.pages.join(' · ')}\n\n`
    }
    if (plan.dataModel?.length) {
      md += `### Data Model\n`
      md += `| Entity | Fields |\n|--------|--------|\n`
      plan.dataModel.forEach((e: any) => {
        md += `| **${e.entity}** | ${(e.fields || []).join(', ')} |\n`
      })
      md += `\n`
    }
    if (plan.estimatedComplexity) {
      md += `**Complexity:** ${plan.estimatedComplexity}\n`
    }
    return md
  }

  return (
    <div className={`landing-root ${isPlanning ? 'planning-mode' : ''}`}>
      <ShaderBackground />

      <div className="relative z-10 flex flex-col h-[100dvh] overflow-hidden">
        {/* ── Pill Navigation ──────────────────────────────────────────── */}
        <Navigation />

        {/* ═══════════════════════════════════════════════════════════════
            STATE: IDLE — Full hero layout
            ═══════════════════════════════════════════════════════════════ */}
        {!isPlanning && (
          <main className="flex-1 flex flex-col items-center justify-center px-5 sm:px-8 pb-8">
            <div className="w-full max-w-2xl flex flex-col items-center gap-6">

              {/* ── Hero: Multi-language name cycling ─────────────────────── */}
              <div className="hero-name-container">
                <span
                  className={`hero-name ${isTransitioning ? 'fading' : 'visible'}`}
                  style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
                >
                  {currentScript.text}
                </span>
              </div>

              <p
                className="text-base sm:text-lg text-[#6B6560] dark:text-[#9E9890] text-center"
                style={{ fontFamily: 'var(--font-dm-sans, var(--font-sora))' }}
              >
                Speak your idea. We build the app.
              </p>

              {/* ── Mic Button (under hero) ──────────────────────────────── */}
              <div className="relative flex items-center justify-center">
                {!isMicActive && (
                  <span className="mic-glow-ring" />
                )}

                {isMicActive && (
                  <>
                    <span className="mic-ring mic-ring-1" />
                    <span className="mic-ring mic-ring-2" />
                  </>
                )}

                <button
                  onClick={handleMicToggle}
                  className={`mic-btn ${isMicActive ? 'mic-active' : ''}`}
                  aria-label={isMicActive ? 'Stop listening' : 'Start speaking'}
                >
                  {isMicActive ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Mic status hint + wave bars */}
              {isMicActive && (
                <>
                  <div className="flex items-center gap-[3px] h-6">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <span
                        key={i}
                        className="wave-bar"
                        style={{ animationDelay: `${i * 0.1}s` }}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-[#E8601A] font-medium tracking-wide">
                    Listening… speak now
                  </p>
                </>
              )}

              {/* ── Input Area ───────────────────────────────────────────── */}
              <form onSubmit={handleSubmit} className="w-full max-w-xl">
                <div className="input-row">
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe your app idea…"
                    className="prompt-textarea"
                    rows={1}
                    autoComplete="off"
                    spellCheck={false}
                  />

                  {/* Model tier selector */}
                  <div className="relative">
                    <button
                      ref={tierBtnRef}
                      type="button"
                      onClick={() => setShowTierMenu(!showTierMenu)}
                      className="tier-btn"
                      title={`${activeTier.label} — ${activeTier.description}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24" />
                      </svg>
                      <span className="tier-btn-label">{activeTier.label.replace('Maya ', '')}</span>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {showTierMenu && (
                      <div ref={tierMenuRef} className="tier-dropdown">
                        {mayaTiers.map((tier, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => { setSelectedTier(i); setShowTierMenu(false) }}
                            className={`tier-option ${selectedTier === i ? 'tier-option-active' : ''}`}
                          >
                            <div>
                              <div className="tier-option-label">{tier.label}</div>
                              <div className="tier-option-desc">{tier.description}</div>
                            </div>
                            <div className="tier-option-price">
                              <div>In {tier.inputPrice}</div>
                              <div>Out {tier.outputPrice}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!prompt.trim()}
                    className={`send-btn ${prompt.trim() ? 'send-active' : 'send-disabled'}`}
                    aria-label="Build"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          </main>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            STATE: PLANNING / READY — Chat-like interface
            ═══════════════════════════════════════════════════════════════ */}
        {isPlanning && (
          <>
            {/* ── Chat messages area ─────────────────────────────────── */}
            <div className="chat-area">
              <div className="chat-scroll">
                {/* User message bubble */}
                <div className="chat-row chat-row-user">
                  <div className="chat-bubble-user">
                    {submittedPrompt}
                  </div>
                </div>

                {/* Thinking indicator */}
                {(isThinking || thinkingText) && (
                  <div className="chat-row chat-row-assistant">
                    <div className="thought-pill-container">
                      <button
                        className={`thought-pill ${isThinking ? 'thought-pill-active' : 'thought-pill-done'}`}
                        onClick={() => setThinkingExpanded(!thinkingExpanded)}
                      >
                        <span className="thought-sparkle">✦</span>
                        <span className="thought-label">
                          {isThinking ? 'Thinking..' : `Thought for ${thinkDuration || 1}s`}
                        </span>
                        <svg
                          width="10" height="10" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5"
                          className={`thought-chevron ${thinkingExpanded ? 'thought-chevron-up' : ''}`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      {thinkingExpanded && (
                        <div className="thought-content">
                          <pre className="thought-pre">{thinkingText}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Assistant plan message */}
                <div className="chat-row chat-row-assistant">
                  <div className="chat-bubble-assistant">
                    {planData ? (
                      <div className="plan-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {buildPlanMarkdown(planData)}
                        </ReactMarkdown>
                      </div>
                    ) : planText ? (
                      <div className="plan-streaming">
                        {/* Show spinner while streaming */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className="plan-spinner" />
                          <span className="text-[12px] font-medium text-[#9E9890]">Analyzing your idea…</span>
                        </div>
                        <pre className="plan-raw">{planText}</pre>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="plan-spinner" />
                        <span className="text-[12px] font-medium text-[#9E9890]">Maya is thinking…</span>
                      </div>
                    )}

                    {/* Approve actions */}
                    {planState === 'ready' && (
                      <div className="plan-chat-actions">
                        <button onClick={handleStartOver} className="plan-btn-secondary">
                          Start Over
                        </button>
                        <button onClick={handleApprove} className="plan-btn-primary">
                          Let's Build →
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div ref={chatEndRef} />
              </div>
            </div>

            {/* ── Bottom input bar (pinned) ───────────────────────────── */}
            <div className="bottom-input-bar">
              <form onSubmit={handleSubmit} className="bottom-input-form">
                <div className="input-row input-row-bottom">
                  {/* Mic button (inline, small) */}
                  <button
                    type="button"
                    onClick={handleMicToggle}
                    className={`inline-mic ${isMicActive ? 'inline-mic-active' : ''}`}
                    aria-label="Mic"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                    </svg>
                  </button>

                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Continue the conversation…"
                    className="prompt-textarea"
                    rows={1}
                  />

                  <button
                    type="submit"
                    disabled={!prompt.trim() || planState === 'streaming'}
                    className={`send-btn ${prompt.trim() && planState !== 'streaming' ? 'send-active' : 'send-disabled'}`}
                    aria-label="Send"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>

      {/* ── Styles ─────────────────────────────────────────────────────── */}
      <style jsx>{`
        .landing-root {
          position: relative;
          min-height: 100dvh;
          background: #F5F4F0;
          color: #1A1917;
          overflow: hidden;
        }
        :global(.dark) .landing-root {
          background: #1A1917;
          color: #F5F4F0;
        }

        /* ── Hero name cycling ────────────────────────────────────── */
        .hero-name-container {
          position: relative;
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @media (min-width: 640px) {
          .hero-name-container { min-height: 110px; }
        }
        .hero-name {
          font-size: clamp(52px, 10vw, 120px);
          font-weight: 800;
          color: #E8601A;
          letter-spacing: -0.02em;
          line-height: 1;
          user-select: none;
          transition: opacity 0.4s cubic-bezier(0.16,1,0.3,1), transform 0.4s cubic-bezier(0.16,1,0.3,1);
          text-shadow: 0 0 60px rgba(232,96,26,0.25);
        }
        .hero-name.visible { opacity: 1; transform: translateY(0) scale(1); }
        .hero-name.fading  { opacity: 0; transform: translateY(-8px) scale(0.97); }

        /* ── Mic button (hero) ────────────────────────────────────── */
        .mic-btn {
          position: relative;
          z-index: 2;
          width: 62px;
          height: 62px;
          border-radius: 50%;
          border: 1.5px solid rgba(232,96,26,0.4);
          background: rgba(232,96,26,0.08);
          color: #E8601A;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 0 20px rgba(232,96,26,0.1);
        }
        .mic-btn:hover {
          background: rgba(232,96,26,0.15);
          border-color: rgba(232,96,26,0.6);
          transform: scale(1.08);
          box-shadow: 0 0 30px rgba(232,96,26,0.2);
        }
        .mic-btn:active { transform: scale(0.95); }

        .mic-active {
          background: #E8601A !important;
          color: white !important;
          border-color: #E8601A !important;
          box-shadow: 0 0 40px rgba(232,96,26,0.4);
          animation: mic-breathe 1.5s ease-in-out infinite;
        }

        @keyframes mic-breathe {
          0%, 100% { box-shadow: 0 0 20px rgba(232,96,26,0.3); }
          50%       { box-shadow: 0 0 50px rgba(232,96,26,0.6); }
        }

        .mic-glow-ring {
          position: absolute;
          width: 74px;
          height: 74px;
          border-radius: 50%;
          border: 2px solid transparent;
          background: conic-gradient(from 0deg, transparent 0%, rgba(232,96,26,0.5) 30%, transparent 60%) border-box;
          -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          animation: glow-spin 3s linear infinite;
          pointer-events: none;
          filter: blur(0.5px);
        }

        @keyframes glow-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .mic-ring {
          position: absolute;
          width: 62px;
          height: 62px;
          border-radius: 50%;
          border: 1.5px solid rgba(232,96,26,0.3);
          animation: pulse-expand 2s ease-out infinite;
          pointer-events: none;
        }
        .mic-ring-2 { animation-delay: 0.6s; }

        @keyframes pulse-expand {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(2.8); opacity: 0; }
        }

        .wave-bar {
          width: 3px;
          height: 20px;
          background: #E8601A;
          border-radius: 2px;
          animation: wave-bar-anim 0.8s ease-in-out infinite;
          transform-origin: center;
        }
        @keyframes wave-bar-anim {
          0%, 100% { transform: scaleY(0.3); opacity: 0.5; }
          50%      { transform: scaleY(1.4); opacity: 1; }
        }

        /* ── Input row (shared between idle and bottom bar) ───────── */
        .input-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          background: white;
          border: 1px solid #E4E1DA;
          border-radius: 16px;
          padding: 6px 6px 6px 18px;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        :global(.dark) .input-row {
          background: rgba(42,41,37,0.8);
          border-color: rgba(255,255,255,0.1);
        }
        .input-row:focus-within {
          border-color: rgba(232,96,26,0.5);
          box-shadow: 0 0 0 3px rgba(232,96,26,0.08);
        }
        :global(.dark) .input-row:focus-within {
          border-color: rgba(232,96,26,0.5);
          box-shadow: 0 0 0 3px rgba(232,96,26,0.1);
        }

        .prompt-textarea {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #1A1917;
          font-family: var(--font-dm-sans, var(--font-sora), sans-serif);
          font-size: 15px;
          padding: 10px 0;
          min-width: 0;
          resize: none;
          line-height: 1.5;
          max-height: 200px;
          overflow-y: auto;
        }
        :global(.dark) .prompt-textarea {
          color: #F5F4F0;
        }
        .prompt-textarea::placeholder {
          color: #9E9890;
        }

        /* ── Tier selector ──────────────────────────────────── */
        .tier-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 10px;
          border-radius: 10px;
          border: 1px solid rgba(0,0,0,0.08);
          background: rgba(0,0,0,0.03);
          color: #6B6560;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .tier-btn:hover {
          border-color: rgba(232,96,26,0.25);
          color: #E8601A;
          background: rgba(232,96,26,0.04);
        }
        :global(.dark) .tier-btn {
          border-color: rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: #9E9890;
        }
        :global(.dark) .tier-btn:hover {
          border-color: rgba(232,96,26,0.25);
          color: #E8601A;
          background: rgba(232,96,26,0.06);
        }
        .tier-btn-label {
          letter-spacing: 0.02em;
        }

        .tier-dropdown {
          position: absolute;
          bottom: calc(100% + 6px);
          right: 0;
          width: 220px;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          border: 1px solid rgba(0,0,0,0.06);
          padding: 4px;
          z-index: 100;
          animation: tier-pop 0.15s cubic-bezier(0.16,1,0.3,1);
        }
        :global(.dark) .tier-dropdown {
          background: #222120;
          border-color: rgba(255,255,255,0.08);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        @keyframes tier-pop {
          from { opacity: 0; transform: translateY(4px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .tier-option {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border: none;
          border-radius: 8px;
          background: transparent;
          cursor: pointer;
          transition: background 0.15s;
          text-align: left;
        }
        .tier-option:hover {
          background: rgba(0,0,0,0.04);
        }
        :global(.dark) .tier-option:hover {
          background: rgba(255,255,255,0.04);
        }
        .tier-option-active {
          background: rgba(232,96,26,0.06) !important;
        }
        .tier-option-label {
          font-size: 12px;
          font-weight: 600;
          color: #1A1917;
        }
        :global(.dark) .tier-option-label {
          color: #D4D0CA;
        }
        .tier-option-active .tier-option-label {
          color: #E8601A;
        }
        .tier-option-desc {
          font-size: 10px;
          color: #9E9890;
          margin-top: 1px;
        }
        .tier-option-price {
          font-size: 9px;
          color: #9E9890;
          text-align: right;
          flex-shrink: 0;
          margin-left: 12px;
        }

        .send-btn {
          flex-shrink: 0;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .send-active {
          background: #E8601A;
          color: white;
        }
        .send-active:hover { background: #C94E12; }
        .send-active:active { transform: scale(0.93); }

        .send-disabled {
          background: #E4E1DA;
          color: #9E9890;
          cursor: not-allowed;
        }
        :global(.dark) .send-disabled {
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.2);
        }

        /* ═══════════════════════════════════════════════════════════════
           PLANNING MODE — Chat-like layout
           ═══════════════════════════════════════════════════════════════ */

        .chat-area {
          flex: 1;
          overflow-y: auto;
          padding: 20px 16px 16px;
          animation: chat-fade-in 0.5s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes chat-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .chat-scroll {
          max-width: 640px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chat-row {
          display: flex;
          animation: msg-slide-in 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes msg-slide-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .chat-row-user {
          justify-content: flex-end;
        }
        .chat-row-assistant {
          justify-content: flex-start;
        }

        /* User bubble */
        .chat-bubble-user {
          background: rgba(232,96,26,0.08);
          border: 1px solid rgba(232,96,26,0.12);
          border-radius: 18px 18px 4px 18px;
          padding: 10px 16px;
          max-width: 80%;
          font-size: 14px;
          line-height: 1.55;
          color: #1A1917;
        }
        :global(.dark) .chat-bubble-user {
          color: #F5F4F0;
        }

        /* Assistant bubble */
        .chat-bubble-assistant {
          max-width: 95%;
          font-size: 13.5px;
          line-height: 1.6;
          color: #1A1917;
        }
        :global(.dark) .chat-bubble-assistant {
          color: #D4D0CA;
        }

        /* ── Thinking pill ─────────────────────────────────────────── */
        .thought-pill-container {
          margin-bottom: 8px;
        }
        .thought-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: all 0.25s ease;
          border: 1px solid transparent;
          background: transparent;
        }

        /* Active: shimmer glare sweeping left→right */
        .thought-pill-active {
          color: #E8601A;
          border-color: rgba(232,96,26,0.15);
          background: rgba(232,96,26,0.04);
        }
        .thought-pill-active::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(232,96,26,0.15) 40%,
            rgba(232,96,26,0.25) 50%,
            rgba(232,96,26,0.15) 60%,
            transparent 100%
          );
          animation: thought-glare 1.8s ease-in-out infinite;
        }
        @keyframes thought-glare {
          0% { left: -100%; }
          100% { left: 100%; }
        }
        .thought-pill-active:hover {
          background: rgba(232,96,26,0.08);
        }

        /* Done: no shimmer, muted */
        .thought-pill-done {
          color: #9E9890;
          border-color: rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
        }
        .thought-pill-done:hover {
          color: #E8601A;
          background: rgba(232,96,26,0.06);
          border-color: rgba(232,96,26,0.15);
        }

        .thought-sparkle {
          font-size: 10px;
          position: relative;
          z-index: 1;
        }
        .thought-label {
          position: relative;
          z-index: 1;
        }
        .thought-chevron {
          position: relative;
          z-index: 1;
          transition: transform 0.2s ease;
          opacity: 0.6;
        }
        .thought-chevron-up {
          transform: rotate(180deg);
        }
        .thought-content {
          animation: thought-expand 0.25s cubic-bezier(0.16,1,0.3,1);
        }
        @keyframes thought-expand {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .thought-pre {
          font-size: 11px;
          color: #6B6560;
          white-space: pre-wrap;
          word-break: break-word;
          margin: 6px 0 0 0;
          padding: 8px 12px;
          border-left: 2px solid rgba(232,96,26,0.2);
          line-height: 1.5;
          max-height: 300px;
          overflow-y: auto;
        }
        :global(.dark) .thought-pre {
          color: #9E9890;
        }

        /* ── Plan markdown styling ─────────────────────────────────── */
        .plan-md :global(h2) {
          font-size: 1.15em;
          font-weight: 700;
          margin: 0 0 8px 0;
          color: #1A1917;
        }
        :global(.dark) .plan-md :global(h2) { color: #F5F4F0; }

        .plan-md :global(h3) {
          font-size: 0.95em;
          font-weight: 600;
          color: #E8601A;
          margin: 12px 0 4px 0;
        }

        .plan-md :global(p) {
          margin: 0 0 6px 0;
          font-size: 13px;
          line-height: 1.55;
          color: #6B6560;
        }
        :global(.dark) .plan-md :global(p) { color: #9E9890; }

        .plan-md :global(ul) {
          padding-left: 1.2em;
          margin: 4px 0 8px 0;
        }
        .plan-md :global(li) {
          font-size: 12.5px;
          line-height: 1.6;
          color: #1A1917;
        }
        :global(.dark) .plan-md :global(li) { color: #D4D0CA; }
        .plan-md :global(li + li) { margin-top: 2px; }

        .plan-md :global(strong) {
          font-weight: 600;
          color: #1A1917;
        }
        :global(.dark) .plan-md :global(strong) { color: #F5F4F0; }

        .plan-md :global(table) {
          border-collapse: collapse;
          width: 100%;
          font-size: 12px;
          margin: 4px 0 8px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          overflow: hidden;
        }
        .plan-md :global(th) {
          padding: 6px 10px;
          text-align: left;
          font-weight: 600;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #E8601A;
          background: rgba(232,96,26,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .plan-md :global(td) {
          padding: 5px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          color: #6B6560;
        }
        :global(.dark) .plan-md :global(td) { color: #9E9890; }

        .plan-md :global(hr) {
          border: none;
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent);
          margin: 12px 0;
        }
        .plan-md :global(em) {
          color: #9E9890;
          font-style: italic;
          font-size: 12px;
        }

        /* Plan streaming raw text */
        .plan-raw {
          font-size: 11px;
          color: #6B6560;
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0;
          max-height: 300px;
          overflow-y: auto;
          font-family: ui-monospace, 'Fira Code', monospace;
        }
        :global(.dark) .plan-raw { color: #9E9890; }

        .plan-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(232,96,26,0.2);
          border-top-color: #E8601A;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ── Approve actions (inside chat bubble) ──────────────────── */
        .plan-chat-actions {
          display: flex;
          gap: 8px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }

        .plan-btn-secondary {
          font-size: 12px;
          padding: 7px 14px;
          border-radius: 10px;
          border: 1px solid #E4E1DA;
          background: transparent;
          color: #6B6560;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        .plan-btn-secondary:hover { background: rgba(0,0,0,0.04); }
        :global(.dark) .plan-btn-secondary {
          border-color: rgba(255,255,255,0.1);
          color: #9E9890;
        }
        :global(.dark) .plan-btn-secondary:hover { background: rgba(255,255,255,0.04); }

        .plan-btn-primary {
          font-size: 12px;
          padding: 7px 18px;
          border-radius: 10px;
          border: none;
          background: #E8601A;
          color: white;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s ease;
        }
        .plan-btn-primary:hover { background: #C94E12; }
        .plan-btn-primary:active { transform: scale(0.96); }

        /* ── Bottom input bar (planning mode) ──────────────────────── */
        .bottom-input-bar {
          flex-shrink: 0;
          border-top: 1px solid #E4E1DA;
          padding: 10px 16px;
          background: #F5F4F0;
        }
        :global(.dark) .bottom-input-bar {
          background: #1A1917;
          border-color: rgba(255,255,255,0.06);
        }

        .bottom-input-form {
          max-width: 640px;
          margin: 0 auto;
        }

        .input-row-bottom {
          padding: 4px 6px 4px 8px;
          border-radius: 14px;
        }

        .inline-mic {
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid rgba(232,96,26,0.3);
          background: transparent;
          color: #E8601A;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .inline-mic:hover {
          background: rgba(232,96,26,0.08);
        }
        .inline-mic-active {
          background: #E8601A !important;
          color: white !important;
          border-color: #E8601A !important;
        }
      `}</style>
    </div>
  )
}
