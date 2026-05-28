'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { useLanguage } from '@/app/providers'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, ArrowLeft, RefreshCw, Mic, MicOff, Code2, Rocket } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  filesModified?: string[]
}

export default function AppEditPage() {
  const params = useParams()
  const router = useRouter()
  const { language } = useLanguage()
  const appId = params.id as string

  const [mounted, setMounted] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sendStage, setSendStage] = useState<'idle' | 'generating' | 'deploying'>('idle')
  const [appUrl, setAppUrl] = useState('')
  const [appName, setAppName] = useState('')
  const [iframeKey, setIframeKey] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Load chat history from localStorage
  const loadHistory = useCallback(() => {
    try {
      const raw = localStorage.getItem(`maya-chat-${appId}`)
      if (raw) return JSON.parse(raw) as ChatMessage[]
    } catch {}
    return null
  }, [appId])

  const saveHistory = useCallback((msgs: ChatMessage[]) => {
    try {
      localStorage.setItem(`maya-chat-${appId}`, JSON.stringify(msgs.slice(-50)))
    } catch {}
  }, [appId])

  useEffect(() => {
    setMounted(true)
    // Load app data
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(data => {
        const found = data.apps?.find((a: { id: string }) => a.id === appId)
        if (found?.url) setAppUrl(found.url)
        if (found?.nameKey) setAppName(found.nameKey)
        if (found?.nameHindi) setAppName(found.nameHindi)
      })
      .catch(() => {})

    // Load chat history or show welcome
    const history = loadHistory()
    if (history && history.length > 0) {
      setMessages(history)
    } else {
      // Show original voice message if available
      const specRaw = localStorage.getItem('maya-app-spec')
      const initialMessages: ChatMessage[] = []

      if (specRaw) {
        try {
          const spec = JSON.parse(specRaw)
          initialMessages.push({
            role: 'user',
            content: spec.nameHindi
              ? `🎤 "${spec.nameHindi}" — ${spec.descriptionEn || spec.name}`
              : `🎤 ${spec.name} — ${spec.descriptionEn}`,
            timestamp: Date.now() - 1000,
          })
          initialMessages.push({
            role: 'assistant',
            content: language === 'hi'
              ? `✅ मैंने "${spec.nameHindi || spec.name}" ऐप बना दिया है! अब बताइए क्या बदलाव चाहिए — जैसे "पेमेंट ऐड करो" या "रंग बदलो"।`
              : `✅ I built "${spec.name}"! Now tell me what changes you want — like "add payment" or "change colors".`,
            timestamp: Date.now(),
          })
        } catch {}
      }

      if (initialMessages.length === 0) {
        initialMessages.push({
          role: 'assistant',
          content: language === 'hi'
            ? '🎨 बताइए आप अपने ऐप में क्या बदलाव चाहते हैं। बोलकर या लिखकर बताएं — मैं कोड बदलूंगा और लाइव प्रीव्यू अपडेट करूंगा।'
            : '🎨 Tell me what changes you want in your app. Type or speak — I\'ll update the code and refresh the live preview.',
          timestamp: Date.now(),
        })
      }

      setMessages(initialMessages)
    }
  }, [appId, language, loadHistory])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Save history on every message change
  useEffect(() => {
    if (messages.length > 0) saveHistory(messages)
  }, [messages, saveHistory])

  // ─── Voice Recording ──────────────────────────────────────────────────────────

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })

      // Check MIME type support
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : 'audio/ogg'

      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setIsRecording(false)

        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        if (blob.size < 1000) return // Too short, ignore

        // Transcribe
        const formData = new FormData()
        formData.append('audio', blob, `voice.${mimeType.split('/')[1]}`)

        try {
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          if (res.ok) {
            const data = await res.json()
            if (data.native) {
              setInput(data.native)
            }
          }
        } catch (e) {
          console.warn('[chat-edit] Transcription failed:', e)
        }
      }

      // Auto-stop after silence (3s) or max duration (20s)
      const audioCtx = new AudioContext()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let silenceStart: number | null = null
      const SILENCE_MS = 5000
      const MAX_MS = 30000
      const startTime = Date.now()

      const checkSilence = () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return
        if (Date.now() - startTime > MAX_MS) {
          recorder.stop()
          audioCtx.close()
          return
        }
        analyser.getByteTimeDomainData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const s = (dataArray[i] - 128) / 128.0
          sum += s * s
        }
        const rms = Math.sqrt(sum / dataArray.length)

        if (rms < 0.02) {
          if (!silenceStart) silenceStart = Date.now()
          else if (Date.now() - silenceStart > SILENCE_MS) {
            recorder.stop()
            audioCtx.close()
            return
          }
        } else {
          silenceStart = null
        }
        requestAnimationFrame(checkSilence)
      }

      recorder.start()
      setIsRecording(true)
      requestAnimationFrame(checkSilence)
    } catch (e) {
      console.warn('[chat-edit] Mic access failed:', e)
    }
  }

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  // ─── Send Message ──────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const userMsg = input.trim()
    setInput('')

    setMessages(prev => [...prev, {
      role: 'user',
      content: userMsg,
      timestamp: Date.now(),
    }])

    setSending(true)
    setSendStage('generating')

    try {
      const res = await fetch('/api/chat-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, userMessage: userMsg }),
      })

      setSendStage('deploying')
      const data = await res.json()

      if (res.ok) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: language === 'hi'
            ? `✅ ${data.summary || 'बदलाव किए गए'}${data.filesModified?.length ? `\n📁 ${data.filesModified.join(', ')}` : ''}`
            : `✅ ${data.summaryEn || 'Changes applied'}${data.filesModified?.length ? `\n📁 ${data.filesModified.join(', ')}` : ''}`,
          timestamp: Date.now(),
          filesModified: data.filesModified,
        }])

        // Update URL if changed
        if (data.url) setAppUrl(data.url)

        // Reload iframe after redeploy (give Vercel a moment)
        setTimeout(() => setIframeKey(prev => prev + 1), 3000)
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: language === 'hi'
            ? `❌ ${data.error || 'बदलाव नहीं हो सके'}`
            : `❌ ${data.error || 'Could not apply changes'}`,
          timestamp: Date.now(),
        }])
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: language === 'hi' ? '❌ सर्वर से कनेक्ट नहीं हो सका' : '❌ Could not connect to server',
        timestamp: Date.now(),
      }])
    } finally {
      setSending(false)
      setSendStage('idle')
    }
  }

  if (!mounted) return null

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden">
      <ShaderBackground />

      <div className="relative z-10">
        <Navigation />

        {/* Back Button */}
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 pt-4">
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.push(`/app/${appId}`)}
            className="flex items-center gap-2 text-sm text-[#6B6560] dark:text-[#9E9890] hover:text-[#E8601A] transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            {language === 'hi' ? 'वापस' : 'Back to App'}
          </motion.button>
        </div>

        {/* Split Panel */}
        <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12 pb-8">
          <div className="grid lg:grid-cols-2 gap-4" style={{ height: 'calc(100vh - 160px)' }}>
            {/* Left: Chat Panel */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 flex flex-col overflow-hidden"
            >
              {/* Chat Header */}
              <div className="px-6 py-4 border-b border-[#E4E1DA] dark:border-white/10">
                <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-sora)' }}>
                  {language === 'hi' ? `💬 ${appName || 'ऐप'} संपादक` : `💬 ${appName || 'App'} Editor`}
                </h2>
                <p className="text-xs text-[#9E9890]">
                  {language === 'hi' ? 'हिंदी या अंग्रेजी में बदलाव बताएं — बोलकर या लिखकर' : 'Describe changes in Hindi or English — type or speak'}
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <AnimatePresence>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={`${msg.timestamp}-${i}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-[#E8601A] text-white'
                            : 'bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0]'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Sending indicator with stage */}
                {sending && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-[#F5F4F0] dark:bg-[#1A1917] px-4 py-3 rounded-2xl flex items-center gap-2">
                      {sendStage === 'generating' ? (
                        <>
                          <Code2 className="w-4 h-4 text-[#E8601A] animate-pulse" />
                          <span className="text-xs text-[#9E9890]">
                            {language === 'hi' ? 'कोड बदल रहा है...' : 'Editing code...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Rocket className="w-4 h-4 text-[#E8601A] animate-bounce" />
                          <span className="text-xs text-[#9E9890]">
                            {language === 'hi' ? 'डिप्लॉय हो रहा है...' : 'Deploying...'}
                          </span>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-[#E4E1DA] dark:border-white/10">
                <div className="flex items-center gap-2">
                  {/* Voice button */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
                    disabled={sending}
                    className={`p-3 rounded-2xl transition-all ${
                      isRecording
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'bg-[#F5F4F0] dark:bg-[#1A1917] text-[#6B6560] hover:text-[#E8601A] border border-[#E4E1DA] dark:border-white/10'
                    } disabled:opacity-50`}
                  >
                    {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </motion.button>

                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={language === 'hi' ? 'बदलाव लिखें या बोलें...' : 'Describe changes or speak...'}
                    className="flex-1 px-4 py-3 rounded-2xl bg-[#F5F4F0] dark:bg-[#1A1917] border border-[#E4E1DA] dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8601A] transition-all"
                    disabled={sending || isRecording}
                  />

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    className="p-3 bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-2xl disabled:opacity-50 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            </motion.div>

            {/* Right: Live Preview */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 overflow-hidden flex flex-col"
            >
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#E4E1DA] dark:border-white/10">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 text-center">
                  <span className="text-xs text-[#9E9890] bg-[#F5F4F0] dark:bg-[#1A1917] px-4 py-1 rounded-full">
                    {language === 'hi' ? 'लाइव प्रीव्यू' : 'Live Preview'}
                  </span>
                </div>
                <motion.button
                  whileHover={{ rotate: 180 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => setIframeKey(prev => prev + 1)}
                  className="p-1 text-[#9E9890] hover:text-[#E8601A]"
                >
                  <RefreshCw className="w-4 h-4" />
                </motion.button>
              </div>

              {/* iframe */}
              <div className="flex-1 relative">
                {appUrl ? (
                  <iframe
                    key={iframeKey}
                    src={appUrl}
                    className="w-full h-full border-0"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    title="Live app preview"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-4xl mb-3">📱</div>
                      <p className="text-sm text-[#9E9890]">
                        {language === 'hi' ? 'प्रीव्यू उपलब्ध नहीं — पहले ऐप बनाएं' : 'No preview — build the app first'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
