'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useLanguage } from '@/app/providers'
import { Navigation } from '@/components/navigation'
import { ShaderBackground } from '@/components/shader-background'
import { MicButton, TranscriptionResult, PageHeader } from '@/components/ui-components'
import { motion, AnimatePresence } from 'framer-motion'
import { content } from '@/lib/translations'

// Response from /api/transcribe
interface TranscriptionResultType {
  native: string
  english: string
  spec: {
    name: string
    nameHindi: string
    descriptionEn: string
    category: string
    features: string[]
    dataFields: { name: string; type: string }[]
    userType: string
  }
}

// ─── Web Speech API Types (no declarations at runtime) ─────────────────────────

interface SpeechRecognitionResultList extends Array<SpeechRecognitionResult> {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
  readonly isFinal: boolean
}

interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onaudioend: ((this: SpeechRecognition, ev: Event) => void) | null
  onaudiostart: ((this: SpeechRecognition, ev: Event) => void) | null
  onend: ((this: SpeechRecognition, ev: Event) => void) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null
  onnomatch: ((this: SpeechRecognition, ev: Event) => void) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onsoundend: ((this: SpeechRecognition, ev: Event) => void) | null
  onsoundstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null
  start(): void
  stop(): void
  abort(): void
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SILENCE_THRESHOLD = 0.025  // RMS below this = silence (raised from 0.015 to handle ambient noise)
const SILENCE_DURATION_MS = 2500 // 2.5s of silence before auto-stop
const MIN_RECORDING_MS = 2000    // Don't auto-stop in first 2s (mic warmup grace period)
const MAX_RECORDING_MS = 30000

export default function RecordPage() {
  const { theme } = useTheme()
  const { language } = useLanguage()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcription, setTranscription] = useState<TranscriptionResultType | null>(null)
  const [liveText, setLiveText] = useState('')
  const [amplitude, setAmplitude] = useState(0)

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const recordingStartRef = useRef<number>(0)

  useEffect(() => {
    setMounted(true)
  }, [router])

  const t = content[language]

  // ─── Cleanup ──────────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    // Stop animation frame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    // Stop silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    // Stop max duration timer
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current)
      maxDurationTimerRef.current = null
    }

    // Stop Web Speech Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // may already be stopped
      }
      recognitionRef.current = null
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // may already be stopped
      }
      mediaRecorderRef.current = null
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }

    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    setAmplitude(0)
  }, [])

  // ─── Silence Detection ────────────────────────────────────────────────────────

  const startSilenceDetection = useCallback(
    (stream: MediaStream) => {
      try {
        const ACtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new ACtx()
        audioContextRef.current = ctx

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048
        analyserRef.current = analyser

        const source = ctx.createMediaStreamSource(stream)
        source.connect(analyser)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        let silenceStart: number | null = null

        const checkSilence = () => {
          if (!analyserRef.current) return

          analyserRef.current.getByteTimeDomainData(dataArray)

          // Calculate RMS amplitude
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            const sample = (dataArray[i] - 128) / 128.0
            sum += sample * sample
          }
          const rms = Math.sqrt(sum / dataArray.length)
          setAmplitude(rms)

          // Check silence — skip during grace period
          if (rms < SILENCE_THRESHOLD) {
            // Only start counting silence after grace period
            const elapsed = Date.now() - (recordingStartRef.current || Date.now())
            if (elapsed > MIN_RECORDING_MS) {
              if (!silenceStart) {
                silenceStart = Date.now()
              } else if (Date.now() - silenceStart > SILENCE_DURATION_MS) {
                // Silence detected — auto stop
                console.log('[record] Auto-stopping: silence detected')
                handleStopRecording()
                return
              }
            }
          } else {
            silenceStart = null
          }

          rafRef.current = requestAnimationFrame(checkSilence)
        }

        rafRef.current = requestAnimationFrame(checkSilence)
      } catch (e) {
        console.warn('[record] Silence detection unavailable:', e)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  // ─── Web Speech Recognition (Live Transcription) ──────────────────────────

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      console.warn('[record] Web Speech API not available')
      return
    }

    try {
      const recognition = new SpeechRecognitionAPI()
      recognition.lang = language === 'hi' ? 'hi-IN' : 'en-US'
      recognition.interimResults = true
      recognition.continuous = true

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimTranscript = ''
        let finalTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' '
          } else {
            interimTranscript += transcript
          }
        }

        setLiveText((prev) => {
          if (finalTranscript) {
            return (prev + ' ' + finalTranscript).trim()
          }
          return prev || interimTranscript
        })
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech') {
          // User hasn't spoken yet, that's OK
          return
        }
        if (event.error === 'aborted' || event.error === 'not-allowed') {
          return
        }
        console.warn('[record] Speech recognition error:', event.error)
      }

      recognition.start()
      recognitionRef.current = recognition
    } catch (e) {
      console.warn('[record] Speech recognition init failed:', e)
    }
  }, [language])

  // ─── Start Recording ──────────────────────────────────────────────────────────

  const handleStartListening = useCallback(async () => {
    if (isListening || isProcessing) return
    setError(null)
    setTranscription(null)
    setLiveText('')
    audioChunksRef.current = []
    recordingStartRef.current = Date.now()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      // Negotiate best available MIME type (Safari doesn't support webm)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg'
        : '' // Let browser choose default

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      const actualMime = recorder.mimeType || mimeType || 'audio/webm'
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        setIsListening(false)
        cleanup()
        setIsProcessing(true)

        try {
          const blob = new Blob(audioChunksRef.current, { type: actualMime })
          const ext = actualMime.split('/')[1]?.split(';')[0] || 'webm'
          const formData = new FormData()
          formData.append('audio', blob, `voice.${ext}`)

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          })

          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `Transcription failed: ${res.status}`)
          }

          const data = await res.json()
          setTranscription({
            native: data.native,
            english: data.english,
            spec: data.spec,
          })
          
          // Auto-continue to builder
          localStorage.setItem('maya-app-spec', JSON.stringify(data.spec))
          router.push('/builder')
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('[record]', msg)
          setError(msg)
        } finally {
          setIsProcessing(false)
        }
      }

      // Start recording and detection
      recorder.start()
      setIsListening(true)

      // Start silence detection
      startSilenceDetection(stream)

      // Start live speech recognition
      startSpeechRecognition()

      // Max duration safety
      maxDurationTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          handleStopRecording()
        }
      }, MAX_RECORDING_MS)

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== 'Permission dismissed') {
        console.warn('[record] mic access', msg)
      }
      setError(msg)
    }
  }, [isListening, isProcessing, cleanup, startSilenceDetection, startSpeechRecognition])

  // ─── Stop Recording ───────────────────────────────────────────────────────────

  const handleStopRecording = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current)
      maxDurationTimerRef.current = null
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // already stopped
      }
      recognitionRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // ─── Tap Handler ──────────────────────────────────────────────────────────────

  const handleMicTap = useCallback(() => {
    if (isListening) {
      handleStopRecording()
    } else {
      handleStartListening()
    }
  }, [isListening, handleStartListening, handleStopRecording])

  // ─── Result Handlers ──────────────────────────────────────────────────────────

  const handleTryAgain = useCallback(() => {
    setTranscription(null)
    setError(null)
    setLiveText('')
    setAmplitude(0)
  }, [])

  const handleContinue = useCallback(() => {
    if (!transcription) return
    localStorage.setItem('maya-app-spec', JSON.stringify(transcription.spec))
    router.push('/builder')
  }, [transcription, router])

  // ─── Clean up on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (!mounted) return null

  return (
    <div className="relative min-h-screen bg-[#F5F4F0] dark:bg-[#1A1917] text-[#1A1917] dark:text-[#F5F4F0] overflow-hidden">
      <ShaderBackground />

      <div className="relative z-10">
        <Navigation />

        <main className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center px-5 sm:px-8 lg:px-12 py-12 sm:py-20">
          <div className="max-w-2xl w-full">
            <PageHeader
              title={t.record.title}
              subtitle={t.record.subtitle}
              language={language}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className={`flex items-start md:items-center justify-center py-12 sm:py-20 transition-all duration-500 w-full ${isListening ? 'flex-col md:flex-row gap-8 lg:gap-16' : 'flex-col gap-6'}`}
            >
              {!transcription ? (
                <>
                  {/* Mic Area with advanced UX */}
                  <div className="relative flex flex-col items-center flex-shrink-0">
                    <MicButton
                      isListening={isListening}
                      isProcessing={isProcessing}
                      onClick={handleMicTap}
                      language={language}
                    />

                    {/* Live amplitude rings — more prominent when listening */}
                    <AnimatePresence>
                      {isListening && (
                        <>
                          <motion.div
                            initial={{ scale: 1, opacity: 0.6 }}
                            animate={{
                              scale: [1, 1.6 + amplitude * 4, 1],
                              opacity: [0.6, 0.2, 0.6],
                            }}
                            exit={{ scale: 1, opacity: 0 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute inset-0 m-auto w-40 h-40 sm:w-48 sm:h-48 rounded-full border-2 border-[#E8601A]/30 pointer-events-none"
                          />
                          <motion.div
                            initial={{ scale: 1, opacity: 0.4 }}
                            animate={{
                              scale: [1, 2.0 + amplitude * 3, 1],
                              opacity: [0.4, 0.1, 0.4],
                            }}
                            exit={{ scale: 1, opacity: 0 }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                            className="absolute inset-0 m-auto w-40 h-40 sm:w-48 sm:h-48 rounded-full border-2 border-[#E8601A]/20 pointer-events-none"
                          />
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Live Transcription Text */}
                  <AnimatePresence>
                    {isListening && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        className="w-full max-w-md"
                      >
                        <div className="bg-white/80 dark:bg-[#2A2925]/80 backdrop-blur-sm rounded-2xl border border-[#E4E1DA] dark:border-white/10 p-4 min-h-[60px]">
                          <p className="text-xs font-semibold text-[#6B6560] dark:text-[#9E9890] uppercase tracking-wider mb-1">
                            {language === 'hi' ? 'सुन रहा हूँ...' : 'Listening...'}
                          </p>
                          <p className="text-sm text-[#1A1917] dark:text-[#F5F4F0] leading-relaxed min-h-[20px]">
                            {liveText || (
                              <span className="animate-pulse text-[#9E9890]">
                                {language === 'hi' ? 'आवाज़ रिकॉर्ड कर रहा हूँ...' : 'Recording your voice...'}
                              </span>
                            )}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Auto-stop hint */}
                  <AnimatePresence>
                    {isListening && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-[#9E9890] dark:text-[#6B6560] mt-3 text-center"
                      >
                        {language === 'hi'
                          ? 'बोलना बंद करें — रिकॉर्डिंग अपने आप रुक जाएगी'
                          : 'Stop speaking — recording will auto-stop'}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-red-500 text-sm text-center mt-4 max-w-sm"
                    >
                      {t.record.error?.replace('{}', error)}
                    </motion.p>
                  )}

                  {/* Description (only when not listening) */}
                  {!isListening && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center text-sm sm:text-base text-[#6B6560] dark:text-[#9E9890] mt-8 sm:mt-12 max-w-sm"
                    >
                      {t.record.description}
                    </motion.p>
                  )}
                </>
              ) : (
                <>
                  <TranscriptionResult
                    nativeText={transcription.native}
                    englishText={transcription.english}
                    language={language}
                    onTryAgain={handleTryAgain}
                  />

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                    className="mt-8"
                  >
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleContinue}
                      className="bg-[#E8601A] hover:bg-[#C94E12] text-white px-8 py-3 rounded-full font-semibold transition-colors shadow-lg"
                    >
                      {t.record.continueBuilding}
                    </motion.button>
                  </motion.div>
                </>
              )}
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  )
}
