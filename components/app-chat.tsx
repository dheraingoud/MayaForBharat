'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '@/app/providers'
import {
  Mic, MicOff, ArrowUp, Square, Plus, X, FileText, FileCode,
  Loader2, AlertCircle, ChevronDown, ChevronRight,
} from 'lucide-react'
import { stripThinking, getStatusLine, type StatusEvent } from '@/lib/status-map'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FileDiff {
  path: string
  action: 'create' | 'modify' | 'delete'
  additions: number
  deletions: number
}

interface Attachment {
  name: string
  type: 'image' | 'code' | 'doc'
  /** base64 data URL for images, raw text content for code/doc */
  data: string
}

interface AppMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  filesModified?: string[]
  duration?: number
  attachments?: Attachment[]
  /** Thinking content — preserved for model, collapsible in UI */
  thinking?: string
  /** File change diffs */
  changes?: { total: number; additions: number; deletions: number; diffs?: FileDiff[] }
  /** v0-like streaming steps — accumulated during SSE */
  steps?: StreamStep[]
}

interface StreamStep {
  type: 'thinking' | 'reading' | 'file_write' | 'deploy' | 'status' | 'error' | 'done'
  label: string
  detail?: string
  additions?: number
  deletions?: number
  time?: number // ms elapsed when this step occurred
}

interface AppChatProps {
  app: {
    id: string
    name: string
    nameHindi?: string
    descriptionEn?: string
    url: string
    messages?: AppMessage[]
  }
  onUpdate: () => void
  onEditSuccess?: (newUrl: string) => void
  /** Build mode — shows build progress in the same chat UI */
  buildMode?: boolean
  buildMessages?: string[]
  buildError?: string | null
  buildPhrase?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCEPTED_FILE_TYPES = 'image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,.md,.txt,.ts,.tsx,.js,.jsx,.css,.json,.html'
const MAX_ATTACHMENTS = 5
const MAX_PERSISTED_MESSAGES = 20

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.json', '.html'])
const DOC_EXTENSIONS = new Set(['.md', '.txt'])

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

function getFileType(file: File): 'image' | 'code' | 'doc' {
  if (file.type.startsWith('image/')) return 'image'
  const ext = getFileExt(file.name)
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  return 'doc'
}

// ═════════════════════════════════════════════════════════════════════════════
// Collapsible Thinking Panel — animated shine effect
// ═════════════════════════════════════════════════════════════════════════════

function ThinkingPanel({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.03] ring-1 ring-white/[0.06] text-[11px] text-[#9E9890] hover:text-white hover:ring-white/[0.12] transition-all overflow-hidden"
      >
        {/* Animated shine sweep */}
        <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="relative z-10">Thinking</span>
        <span className="relative z-10 opacity-40">·</span>
        <span className="relative z-10 opacity-40 font-mono">{content.length > 100 ? `${Math.ceil(content.length / 100)}` : '1'} step{content.length > 100 ? 's' : ''}</span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 px-3 py-2 rounded-lg bg-white/[0.02] ring-1 ring-white/[0.04] text-[11px] text-[#6B6560] font-mono leading-[1.6] whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// StreamProgress — v0-style: single live status + file items, clean & minimal
// ═════════════════════════════════════════════════════════════════════════════

function StreamProgress({ steps, isActive }: { steps: StreamStep[]; isActive: boolean }) {
  if (steps.length === 0 && isActive) {
    // Initial state: just show dots
    return (
      <div className="flex items-center gap-1.5 py-1">
        <span className="inline-flex gap-[3px]">
          {[0,1,2].map(d => (
            <motion.span key={d} className="w-[5px] h-[5px] rounded-full bg-[#E8601A]"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
            />
          ))}
        </span>
      </div>
    )
  }

  // During streaming: show only file_write steps (the actual work)
  // + the latest non-file status as a single line
  const fileSteps = steps.filter(s => s.type === 'file_write')
  const lastStatus = [...steps].reverse().find(s => s.type === 'status' || s.type === 'reading' || s.type === 'deploy')
  const hasError = steps.some(s => s.type === 'error')
  const isDone = steps.some(s => s.type === 'done')

  return (
    <div className="space-y-2 py-1">
      {/* File changes — each on its own line, v0 style */}
      {fileSteps.map((step, i) => (
        <motion.div
          key={`f-${i}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2.5 text-[13px]"
        >
          <FileText className="w-4 h-4 text-[#6B6560] shrink-0" />
          <span className="text-[#B8B4AE]">{step.label}</span>
        </motion.div>
      ))}

      {/* Current status — single line, only while active */}
      {isActive && !isDone && lastStatus && fileSteps.length === 0 && (
        <div className="flex items-center gap-2 text-[13px] text-[#6B6560]">
          <span>{lastStatus.label}</span>
          <span className="inline-flex gap-[3px]">
            {[0,1,2].map(d => (
              <motion.span key={d} className="w-[4px] h-[4px] rounded-full bg-[#6B6560]"
                animate={{ opacity: [0.2, 0.8, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2 }}
              />
            ))}
          </span>
        </div>
      )}

      {/* Active dots after file changes */}
      {isActive && !isDone && fileSteps.length > 0 && (
        <div className="flex items-center gap-1.5 pl-[26px]">
          <span className="inline-flex gap-[3px]">
            {[0,1,2].map(d => (
              <motion.span key={d} className="w-[4px] h-[4px] rounded-full bg-[#E8601A]"
                animate={{ opacity: [0.2, 1, 0.2] }}
                transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
              />
            ))}
          </span>
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="flex items-center gap-2 text-[13px] text-red-400/80">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{steps.find(s => s.type === 'error')?.label}</span>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// AppliedChangesBadge — v0-style compact pill: "Applied changes  +N / -N"
// ═════════════════════════════════════════════════════════════════════════════

function AppliedChangesBadge({ changes }: { changes: AppMessage['changes'] }) {
  if (!changes || changes.total === 0) return null

  return (
    <div className="flex items-center gap-3 mt-2 py-2 px-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <div className="flex items-center gap-2 text-[13px] text-[#B8B4AE]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6B6560]">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
        <span className="font-medium">Applied changes</span>
      </div>
      <div className="flex items-center gap-2 ml-auto text-[12px] font-mono">
        <span className="text-emerald-400/80">+{changes.additions}</span>
        <span className="text-[#4A4742]">/</span>
        <span className="text-red-400/80">-{changes.deletions}</span>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// AppChat — SSE streaming, smart attachments, file change summaries
// ═════════════════════════════════════════════════════════════════════════════

export function AppChat({ app, onUpdate, onEditSuccess, buildMode, buildMessages, buildError, buildPhrase }: AppChatProps) {
  const { language } = useLanguage()
  const [messages, setMessages] = useState<AppMessage[]>(app.messages || [])
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [streamSteps, setStreamSteps] = useState<StreamStep[]>([])
  const [textInput, setTextInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const msgsRef = useRef<AppMessage[]>(messages)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t0Ref = useRef<number>(0)
  const abortRef = useRef<AbortController | null>(null)
  const stepsRef = useRef<StreamStep[]>([])
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => { msgsRef.current = messages }, [messages])
  // Load messages from props — runs on mount AND when app data refreshes (e.g. after build completes)
  useEffect(() => {
    if (app.messages?.length && messages.length === 0) {
      setMessages(app.messages)
    }
  }, [app.id, app.messages?.length])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, statusMessage])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }
  }, [textInput])

  // ── Persist ──────────────────────────────────────────────────────────────

  const persist = useCallback((msgs: AppMessage[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const toSave = msgs.slice(-MAX_PERSISTED_MESSAGES).map(m => ({
          role: m.role,
          content: m.content.slice(0, 2000),
          timestamp: m.timestamp,
        }))
        await fetch(`/api/apps/${app.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: toSave }),
        })
      } catch { /* silent */ }
    }, 1500)
  }, [app.id])

  // ── File Attachment ─────────────────────────────────────────────────────

  const handleFileSelect = () => fileInputRef.current?.click()

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      if (attachments.length >= MAX_ATTACHMENTS) break
      const fileType = getFileType(file)

      if (fileType === 'image') {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string
          setAttachments(prev => prev.length < MAX_ATTACHMENTS ? [...prev, { name: file.name, type: 'image', data: dataUrl }] : prev)
        }
        reader.readAsDataURL(file)
      } else {
        // Code/doc files — read as text
        const text = await file.text()
        setAttachments(prev => prev.length < MAX_ATTACHMENTS ? [...prev, { name: file.name, type: fileType, data: text }] : prev)
      }
    }
    if (e.target) e.target.value = ''
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  // ── Send Edit (SSE streaming) ──────────────────────────────────────────

  const sendEdit = async (query: string) => {
    if ((!query.trim() && attachments.length === 0) || isProcessing) return
    setIsProcessing(true)
    setStatusMessage(getStatusLine('reading_files', language))
    setStreamSteps([]) // Reset v0-like steps
    stepsRef.current = []
    t0Ref.current = Date.now()

    const currentAttachments = [...attachments]
    const userMsg: AppMessage = {
      role: 'user',
      content: query,
      timestamp: Date.now(),
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
    }
    const updated = [...msgsRef.current, userMsg]
    setMessages(updated)
    setTextInput('')
    setAttachments([])

    // Prepare attached code/doc files for AI context
    const attachedFiles = currentAttachments
      .filter(a => a.type === 'code' || a.type === 'doc')
      .map(a => ({ name: a.name, content: a.data }))

    // Create abort controller for this request
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: app.id,
          userMessage: query,
          attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      // Read SSE stream with timeout protection
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let resultData: any = null
      let thinkingContent = ''
      let streamedFiles: FileDiff[] = []
      let lastStatus = ''
      let errorMessage = ''
      const STREAM_TIMEOUT_MS = 90_000 // 90 seconds without data = timeout
      let lastDataAt = Date.now()

      // Helper: push a step to both state (live UI) and ref (for message embedding)
      const addStep = (step: StreamStep) => {
        stepsRef.current = [...stepsRef.current, step]
        setStreamSteps(prev => [...prev, step])
      }

      while (true) {
        // Timeout: if no data for 90s, assume stream died
        if (Date.now() - lastDataAt > STREAM_TIMEOUT_MS) {
          console.warn('[AppChat] Stream timeout — no data for 90s')
          errorMessage = errorMessage || (language === 'hi' ? 'कनेक्शन टाइमआउट हो गया।' : 'Connection timed out.')
          break
        }

        const { done, value } = await reader.read()
        if (done) break
        lastDataAt = Date.now() // Reset timeout on each chunk
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

            switch (event.type) {
              case 'status': {
                lastStatus = event.message
                setStatusMessage(event.message)
                const elapsed = Date.now() - t0Ref.current
                const stepType: StreamStep['type'] = 
                  event.event === 'reading_files' ? 'reading' :
                  event.event === 'deploying' ? 'deploy' :
                  event.event === 'deploy_skipped' || event.event === 'deploy_warning' ? 'error' :
                  'status'
                addStep({ type: stepType, label: event.message, time: elapsed })
                break
              }
              case 'thinking':
                thinkingContent = event.content
                addStep({ 
                  type: 'thinking', 
                  label: `Thought for ${Math.round((Date.now() - t0Ref.current) / 1000)}s`,
                  time: Date.now() - t0Ref.current 
                })
                break
              case 'file_change': {
                streamedFiles.push({
                  path: event.path,
                  action: event.action || 'modify',
                  additions: event.additions || 0,
                  deletions: event.deletions || 0,
                })
                const fileName = event.path.split('/').pop() || event.path
                const actionLabel = event.action === 'create' ? 'Created' : 'Updated'
                addStep({ 
                  type: 'file_write', 
                  label: `${actionLabel} ${fileName}`, 
                  detail: event.path,
                  additions: event.additions || 0, 
                  deletions: event.deletions || 0,
                  time: Date.now() - t0Ref.current 
                })
                setStatusMessage(`${event.action === 'create' ? 'Creating' : 'Updating'} ${fileName}...`)
                break
              }
              case 'done':
                resultData = event
                addStep({ type: 'done', label: language === 'hi' ? 'पूरा हुआ' : 'Complete', time: Date.now() - t0Ref.current })
                break
              case 'error':
                errorMessage = event.message
                addStep({ type: 'error', label: event.message, time: Date.now() - t0Ref.current })
                break
            }
          } catch (parseErr) {
            // Ignore incomplete JSON chunks — they'll be completed in the next read
            if (parseErr instanceof Error && 
                !parseErr.message.includes('Unexpected') && 
                !parseErr.message.includes('JSON')) {
              throw parseErr
            }
          }
        }
      }

      const duration = Date.now() - t0Ref.current

      // Handle error event from stream
      if (errorMessage && !resultData) {
        const aMsg: AppMessage = {
          role: 'assistant',
          content: errorMessage,
          timestamp: Date.now(),
          duration,
          steps: stepsRef.current.length > 0 ? stepsRef.current : undefined,
        }
        const final = [...updated, aMsg]
        setMessages(final); persist(final)
      }
      // Handle successful done event
      else if (resultData) {
        const aMsg: AppMessage = {
          role: 'assistant',
          content: language === 'hi'
            ? (resultData.summary || getStatusLine('done', 'hi'))
            : (resultData.summaryEn || getStatusLine('done', 'en')),
          timestamp: Date.now(),
          filesModified: resultData.filesModified,
          duration,
          thinking: thinkingContent || undefined,
          changes: resultData.changes,
          steps: stepsRef.current.length > 0 ? stepsRef.current : undefined,
        }
        const final = [...updated, aMsg]
        setMessages(final); persist(final)
        // Only reload preview if this was a FULL recovery (not partial)
        if (resultData.url && onEditSuccess && !resultData.isPartialRecovery) {
          onEditSuccess(resultData.url)
        }
        onUpdate()
      }
      // Fallback: stream ended without done or error — but we DO have file changes
      else if (streamedFiles.length > 0) {
        const totalAdd = streamedFiles.reduce((s, f) => s + f.additions, 0)
        const totalDel = streamedFiles.reduce((s, f) => s + f.deletions, 0)
        const aMsg: AppMessage = {
          role: 'assistant',
          content: language === 'hi' 
            ? `${streamedFiles.length} फ़ाइलें अपडेट की गईं` 
            : `Updated ${streamedFiles.length} file${streamedFiles.length > 1 ? 's' : ''}`,
          timestamp: Date.now(),
          duration,
          thinking: thinkingContent || undefined,
          changes: {
            total: streamedFiles.length,
            additions: totalAdd,
            deletions: totalDel,
            diffs: streamedFiles,
          },
          steps: stepsRef.current.length > 0 ? stepsRef.current : undefined,
        }
        const final = [...updated, aMsg]
        setMessages(final); persist(final)
        onUpdate()
      }
      // Absolute fallback: nothing happened
      else if (duration > 5000) {
        const aMsg: AppMessage = {
          role: 'assistant',
          content: language === 'hi' ? 'कोई बदलाव नहीं हुआ।' : 'No changes were made.',
          timestamp: Date.now(),
          duration,
        }
        const final = [...updated, aMsg]
        setMessages(final); persist(final)
      }
    } catch (err) {
      const duration = Date.now() - t0Ref.current
      const isAborted = err instanceof DOMException && err.name === 'AbortError'
      if (!isAborted) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        const aMsg: AppMessage = {
          role: 'assistant',
          content: language === 'hi' ? getStatusLine('error', 'hi') : errorMsg,
          timestamp: Date.now(),
          duration,
        }
        const final = [...updated, aMsg]
        setMessages(final); persist(final)
      }
    } finally {
      abortRef.current = null
      setIsProcessing(false)
      setStatusMessage('')
    }
  }

  // ── Voice ──────────────────────────────────────────────────────────────

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/ogg'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      recRef.current = rec

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setIsRecording(false)
        const blob = new Blob(chunksRef.current, { type: mime })
        if (blob.size < 1000) return
        const fd = new FormData()
        fd.append('audio', blob, `voice.${mime.split('/')[1]}`)
        try {
          const r = await fetch('/api/transcribe', { method: 'POST', body: fd })
          if (r.ok) { const d = await r.json(); if (d.native) sendEdit(d.native) }
        } catch { /* */ }
      }

      const ctx = new AudioContext()
      const an = ctx.createAnalyser(); an.fftSize = 2048
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.frequencyBinCount)
      let sil: number | null = null
      const s = Date.now()
      const check = () => {
        if (!recRef.current || recRef.current.state === 'inactive') return
        if (Date.now() - s > 30000) { rec.stop(); ctx.close(); return }
        an.getByteTimeDomainData(buf)
        let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
        if (Math.sqrt(sum / buf.length) < 0.02) {
          if (!sil) sil = Date.now(); else if (Date.now() - sil > 5000) { rec.stop(); ctx.close(); return }
        } else sil = null
        requestAnimationFrame(check)
      }
      rec.start(); setIsRecording(true); requestAnimationFrame(check)
    } catch { /* mic fail */ }
  }

  const stopRec = () => { if (recRef.current?.state !== 'inactive') recRef.current?.stop() }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendEdit(textInput) }
  }

  const hasInput = textInput.trim().length > 0 || attachments.length > 0

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#1A1917]">

      {/* ── SCROLLABLE MESSAGES ─────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 pt-4 pb-2 space-y-5">

          {/* Empty state — only when NOT in build mode */}
          {messages.length === 0 && !isProcessing && !buildMode && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-11 h-11 rounded-xl bg-[#E8601A]/[0.07] flex items-center justify-center mb-3.5">
                <svg className="w-5 h-5 text-[#E8601A]/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <p className="text-[13px] text-[#6B6560] leading-relaxed max-w-[220px]">
                {language === 'hi'
                  ? 'अपने ऐप में बदलाव करने के लिए बोलें या लिखें'
                  : 'Ask Maya to make changes to your app'}
              </p>
            </div>
          )}

          {/* ── Build Mode Messages ──────────────────────────────── */}
          {buildMode && buildMessages && buildMessages.map((msg, i) => {
            const isUser = msg.startsWith('[USER] ')
            return (
              <motion.div
                key={`build-${i}`}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: i * 0.03 }}
              >
                {isUser ? (
                  <div className="space-y-1">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] px-3.5 py-2.5 bg-[#E8601A] text-white text-[13px] leading-[1.55] rounded-[18px] rounded-tr-[4px] whitespace-pre-wrap">
                        {msg.slice(7)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4A4742] select-none">MAYA</div>
                    <div className="text-[13px] text-[#D4D0CA] leading-[1.65]">{msg}</div>
                  </div>
                )}
              </motion.div>
            )
          })}

          {/* Build error */}
          {buildMode && buildError && (
            <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/10">
              <p className="text-[13px] text-red-400">{buildError}</p>
            </div>
          )}

          {/* Build phrase animation */}
          {buildMode && !buildError && buildPhrase && (
            <motion.div
              key={buildPhrase}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 px-1 py-2"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E8601A]" />
              <span className="text-[11px] text-[#6B6560] italic">{buildPhrase}</span>
              <span className="inline-flex gap-0.5 ml-1">
                {[0,1,2].map(d => (
                  <motion.span
                    key={d}
                    className="w-1 h-1 rounded-full bg-[#E8601A]"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: d * 0.2 }}
                  />
                ))}
              </span>
            </motion.div>
          )}

          {/* ── Message list ──────────────────────────────────────── */}
          {messages.map((msg, idx) => (
            <div key={`${msg.timestamp}-${idx}`}>

              {/* USER → right-aligned orange bubble */}
              {msg.role === 'user' && (
                <div className="space-y-1.5">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] px-3.5 py-2.5 bg-[#E8601A] text-white text-[13px] leading-[1.55] rounded-[18px] rounded-tr-[4px] whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                  {/* Attachments */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex justify-end gap-1.5 pr-1 flex-wrap">
                      {msg.attachments.map((att, i) => (
                        att.type === 'image' ? (
                          <img key={i} src={att.data} alt={att.name} className="w-14 h-14 rounded-lg object-cover ring-1 ring-white/10" />
                        ) : (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-white/[0.03] ring-1 ring-white/[0.06] text-[#9E9890]">
                            {att.type === 'code' ? <FileCode className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                            {att.name}
                          </span>
                        )
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end pr-1">
                    <span className="text-[10px] text-[#6B6560]">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              )}

              {/* ASSISTANT → v0-style: clean, progressive, professional */}
              {msg.role === 'assistant' && (
                <div className="space-y-2.5">
                  {/* Content — the answer text, shown FIRST like v0 */}
                  <div className="text-[14px] text-[#D4D0CA] leading-[1.7] whitespace-pre-wrap">
                    {stripThinking(msg.content).display}
                  </div>

                  {/* File changes as inline items — v0 style "📄 Made some changes" */}
                  {msg.steps && msg.steps.filter(s => s.type === 'file_write').length > 0 && (
                    <div className="space-y-1.5">
                      {msg.steps.filter(s => s.type === 'file_write').map((step, i) => (
                        <div key={i} className="flex items-center gap-2.5 text-[13px] text-[#9E9890]">
                          <FileText className="w-4 h-4 text-[#6B6560]" />
                          <span>{step.label}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* v0-style "Applied changes +N / -N" badge */}
                  <AppliedChangesBadge changes={msg.changes} />

                  {/* Collapsible thinking panel — shows model reasoning */}
                  {msg.thinking && <ThinkingPanel content={msg.thinking} />}

                  {/* Meta: duration + timeAgo — subtle bottom line */}
                  <div className="flex items-center gap-2 text-[11px] text-[#6B6560]">
                    {msg.duration && msg.duration > 0 && (
                      <span>{fmtDuration(msg.duration)}</span>
                    )}
                    {msg.duration && msg.duration > 0 && <span>·</span>}
                    <span>{timeAgo(msg.timestamp)}</span>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Processing indicator — v0-like streaming steps */}
          <AnimatePresence>
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="space-y-1"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4A4742] select-none">
                  MAYA
                </div>
                <StreamProgress steps={streamSteps} isActive={true} />
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={endRef} />
        </div>
      </div>

      {/* ── FIXED INPUT BAR (hidden during build) ─────────────────── */}
      {buildMode ? (
        <div className="shrink-0 border-t border-white/[0.06] bg-[#1A1917] px-4 py-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#E8601A]" />
          <span className="text-[12px] text-[#6B6560]">
            {language === 'hi' ? 'आपका ऐप बन रहा है...' : 'Building your app...'}
          </span>
        </div>
      ) : (
      <div className="shrink-0 border-t border-white/[0.06] bg-[#1A1917]">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          multiple
          className="hidden"
          onChange={handleFilesChange}
        />

        <div className="px-3 py-2.5">
          <div className="bg-[#222120] rounded-xl ring-1 ring-white/[0.05] focus-within:ring-[#E8601A]/20 transition-all overflow-hidden">

            {/* Attachment preview strip */}
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-1 flex-wrap">
                    {attachments.map((att, i) => (
                      <div key={i} className="relative group">
                        {att.type === 'image' ? (
                          <img src={att.data} alt={att.name} className="w-14 h-14 rounded-lg object-cover ring-1 ring-white/10" />
                        ) : (
                          <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06]">
                            {att.type === 'code' ? <FileCode className="w-3.5 h-3.5 text-[#E8601A]/50" /> : <FileText className="w-3.5 h-3.5 text-[#E8601A]/50" />}
                            <span className="text-[11px] text-[#9E9890] max-w-[80px] truncate">{att.name}</span>
                          </div>
                        )}
                        <button
                          onClick={() => removeAttachment(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1A1917] ring-1 ring-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3 text-[#9E9890]" />
                        </button>
                      </div>
                    ))}
                    {attachments.length < MAX_ATTACHMENTS && (
                      <button
                        onClick={handleFileSelect}
                        className="w-14 h-14 rounded-lg border border-dashed border-white/10 flex items-center justify-center text-[#6B6560] hover:text-[#9E9890] hover:border-white/20 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main input row */}
            <div className="flex items-end gap-1 px-1 py-1">
              <button
                onClick={handleFileSelect}
                className="p-2 mb-0.5 text-[#9E9890] hover:text-white transition-colors rounded-lg hover:bg-white/[0.06] shrink-0"
                title={language === 'hi' ? 'फ़ाइल जोड़ें' : 'Attach file'}
              >
                <Plus className="w-4 h-4" />
              </button>

              <textarea
                ref={textareaRef}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={language === 'hi' ? 'कुछ बदलना है...' : 'Ask a follow-up...'}
                rows={1}
                className="flex-1 bg-transparent border-none outline-none text-[13px] text-[#F5F4F0] placeholder:text-[#6B6560] min-w-0 py-2 resize-none leading-[1.5] max-h-[120px]"
                disabled={isProcessing}
                style={{ height: 'auto' }}
              />

              <button
                onClick={isRecording ? stopRec : startRec}
                disabled={isProcessing && !isRecording}
                className={`p-2 mb-0.5 rounded-lg transition-all shrink-0 ${
                  isRecording
                    ? 'bg-red-500/20 text-red-400 animate-pulse ring-2 ring-red-500/30'
                    : 'text-[#E8601A] bg-[#E8601A]/[0.08] hover:bg-[#E8601A]/15 ring-1 ring-[#E8601A]/20'
                } disabled:opacity-30`}
                title={isRecording ? 'Stop' : 'Voice'}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {isProcessing ? (
                <button
                  onClick={() => { 
                    abortRef.current?.abort()
                    setIsProcessing(false)
                    setStatusMessage('')
                    setStreamSteps(prev => [...prev, { type: 'error', label: 'Stopped', time: Date.now() - t0Ref.current }])
                  }}
                  className="p-2 mb-0.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/8 transition-colors shrink-0"
                  title="Stop"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={() => sendEdit(textInput)}
                  disabled={!hasInput}
                  className={`p-1.5 mb-1 mr-0.5 rounded-full transition-all shrink-0 ${
                    hasInput ? 'bg-[#E8601A] text-white hover:bg-[#C94E12]' : 'bg-white/[0.06] text-[#6B6560]'
                  } disabled:cursor-default`}
                  title="Send"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
