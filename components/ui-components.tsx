'use client'

import { motion } from 'framer-motion'
import { ReactNode } from 'react'
import { content } from '@/lib/translations'
import { BezelCard } from '@/components/ui/double-bezel'

// ─── Animation Constants ─────────────────────────────────────────────────────

const EASE_PREMIUM = [0.32, 0.72, 0, 1] as const

// ─── Category Gradient Map ────────────────────────────────────────────────────

const categoryGradients: Record<string, string> = {
  'Stock Tracker': 'from-amber-400/20 to-orange-500/10 dark:from-amber-400/10 dark:to-orange-500/5',
  'स्टॉक ट्रैकर': 'from-amber-400/20 to-orange-500/10 dark:from-amber-400/10 dark:to-orange-500/5',
  'Measurements': 'from-blue-400/20 to-indigo-500/10 dark:from-blue-400/10 dark:to-indigo-500/5',
  'माप ट्रैकर': 'from-blue-400/20 to-indigo-500/10 dark:from-blue-400/10 dark:to-indigo-500/5',
  'Daily Orders': 'from-emerald-400/20 to-teal-500/10 dark:from-emerald-400/10 dark:to-teal-500/5',
  'दैनिक ऑर्डर': 'from-emerald-400/20 to-teal-500/10 dark:from-emerald-400/10 dark:to-teal-500/5',
}

const defaultGradient = 'from-[#E8601A]/15 to-[#E8601A]/5 dark:from-[#E8601A]/10 dark:to-[#E8601A]/3'

// ─── Status Badge ─────────────────────────────────────────────────────────────

export function StatusBadge({
  status,
  language = 'en',
}: {
  status: 'live' | 'building'
  language?: 'en' | 'hi'
}) {
  const isLive = status === 'live'
  const t = content[language].uiComponents
  const statusText = isLive ? t.live : t.building

  return (
    <div
      className={`rounded-full px-2.5 py-1 text-[10px] font-medium flex items-center gap-1.5 bg-white/90 dark:bg-[#2A2925]/90 backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10 ${
        isLive ? 'text-[#2D7A4F]' : 'text-[#E8601A]'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isLive ? 'bg-[#2D7A4F]' : 'bg-[#E8601A] animate-breathe'
        }`}
      />
      {statusText}
    </div>
  )
}

// ─── App Card ─────────────────────────────────────────────────────────────────

export function AppCard({
  name,
  type,
  emoji,
  status,
  updates,
  onOpen,
  onDelete,
  language = 'en',
}: {
  name: string
  type: string
  emoji: string
  status: 'live' | 'building'
  updates: number
  onOpen: () => void
  onDelete?: (e: React.MouseEvent) => void
  language?: 'en' | 'hi'
}) {
  const gradient = categoryGradients[type] || defaultGradient

  return (
    <BezelCard hoverable onClick={onOpen} className="overflow-hidden group">
      {/* Preview — Category gradient with initial letter (no emoji) */}
      <div className={`aspect-video bg-gradient-to-br ${gradient} flex items-center justify-center relative overflow-hidden`}>
        <span
          className="text-6xl sm:text-7xl font-bold text-[#E8601A]/10 dark:text-[#E8601A]/8 select-none"
          style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
        >
          {name.charAt(0).toUpperCase()}
        </span>

        {/* Status Badge */}
        <div className="absolute top-3 left-3">
          <StatusBadge status={status} language={language} />
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

        <span className="inline-block px-3 py-1 bg-[#FDF0E8] dark:bg-[#E8601A]/15 text-[#E8601A] text-xs font-medium rounded-full ring-1 ring-[#E8601A]/10 mb-4">
          {type}
        </span>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#E4E1DA] dark:border-white/10">
          <div className="flex items-center gap-2 text-xs text-[#6B6560] dark:text-[#9E9890]">
            <span className="w-1 h-1 rounded-full bg-current" />
            <span>
              {updates} {content[language].uiComponents.updates}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {onDelete && (
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
            )}
            <span className="text-[#E8601A] text-xs font-medium group-hover:translate-x-0.5 transition-transform duration-300">
              {content[language].uiComponents.open} →
            </span>
          </div>
        </div>
      </div>
    </BezelCard>
  )
}

// ─── Feature Card ─────────────────────────────────────────────────────────────

export function FeatureCard({
  title,
  description,
  iconComponent,
  index = 0,
}: {
  title: string
  description: string
  iconComponent: ReactNode
  index?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: index * 0.08, ease: EASE_PREMIUM }}
      viewport={{ once: true }}
    >
      <BezelCard hoverable className="group">
        <div className="p-8 sm:p-10">
          <div className="text-4xl sm:text-5xl mb-5 sm:mb-6">{iconComponent}</div>
          <h3
            className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-[#1A1917] dark:text-white tracking-tight"
            style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
          >
            {title}
          </h3>
          <p className="text-sm sm:text-base text-[#6B6560] dark:text-[#9E9890] leading-relaxed">
            {description}
          </p>
        </div>
      </BezelCard>
    </motion.div>
  )
}

// ─── Mic Button ───────────────────────────────────────────────────────────────

export function MicButton({
  isListening,
  isProcessing,
  onClick,
  language = 'en',
}: {
  isListening: boolean
  isProcessing: boolean
  onClick: () => void
  language?: 'en' | 'hi'
}) {
  return (
    <motion.div className="relative w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center">
      {/* Ripple rings */}
      {(isListening || isProcessing) && (
        <>
          <motion.div
            animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: EASE_PREMIUM }}
            className="absolute inset-0 rounded-full border border-[#E8601A]/30"
          />
          <motion.div
            animate={{ scale: [1, 2], opacity: [0.4, 0] }}
            transition={{ duration: 2, delay: 0.3, repeat: Infinity, ease: EASE_PREMIUM }}
            className="absolute inset-0 rounded-full border border-[#E8601A]/20"
          />
        </>
      )}

      {/* Main Button — Double-Bezel inspired */}
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={onClick}
        disabled={isProcessing}
        className={`relative w-32 h-32 sm:w-40 sm:h-40 rounded-full font-semibold text-white transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] shadow-2xl flex flex-col items-center justify-center gap-2 ring-2 ring-white/10 ${
          isListening
            ? 'bg-red-500 hover:bg-red-600'
            : isProcessing
              ? 'bg-[#E8601A] opacity-75 cursor-not-allowed'
              : 'bg-[#E8601A] hover:bg-[#C94E12]'
        }`}
        aria-label={
          isListening
            ? content[language].uiComponents.listening
            : content[language].uiComponents.startSpeaking
        }
      >
        {/* Microphone SVG icon */}
        <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>

        {/* Status label */}
        <span className="text-xs sm:text-sm font-medium">
          {isProcessing
            ? content[language].uiComponents.processing
            : isListening
              ? content[language].uiComponents.listening
              : content[language].uiComponents.speak}
        </span>
      </motion.button>

      {/* Waveform Bars (during listening) */}
      {isListening && (
        <div className="absolute inset-0 flex items-center justify-center gap-1 pointer-events-none">
          {[...Array(7)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ height: ['16px', '48px', '16px'] }}
              transition={{
                duration: 0.5 + i * 0.05,
                delay: i * 0.04,
                repeat: Infinity,
                ease: EASE_PREMIUM,
              }}
              className="w-0.5 rounded-full bg-white/30"
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── Transcription Result ─────────────────────────────────────────────────────

export function TranscriptionResult({
  nativeText,
  englishText,
  language = 'en',
  onTryAgain,
}: {
  nativeText: string
  englishText: string
  language?: 'en' | 'hi'
  onTryAgain: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE_PREMIUM }}
      className="w-full max-w-2xl mx-auto space-y-5"
    >
      {/* Native Language Result */}
      <BezelCard>
        <div className="p-5 sm:p-6">
          <p className="text-[10px] font-semibold text-[#6B6560] dark:text-[#9E9890] mb-3 uppercase tracking-[0.15em]">
            {content[language].uiComponents.yourLanguage}
          </p>
          <p className="text-base sm:text-lg text-[#1A1917] dark:text-white leading-relaxed">
            {nativeText}
          </p>
        </div>
      </BezelCard>

      {/* English Translation */}
      <div className="bg-[#F5F4F0] dark:bg-[#3A3530] rounded-2xl ring-1 ring-black/5 dark:ring-white/5 p-5 sm:p-6">
        <p className="text-[10px] font-semibold text-[#6B6560] dark:text-[#9E9890] mb-3 uppercase tracking-[0.15em]">
          {content[language].uiComponents.inEnglish}
        </p>
        <p className="text-base sm:text-lg text-[#1A1917] dark:text-[#E5E5E0] leading-relaxed">
          {englishText}
        </p>
      </div>

      {/* Try Again Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={onTryAgain}
        className="w-full bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-full py-3 font-semibold shadow-lg transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] cursor-pointer active:scale-[0.98]"
      >
        {content[language].uiComponents.tryAgain}
      </motion.button>
    </motion.div>
  )
}

// ─── Page Header ──────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
  language?: 'en' | 'hi'
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE_PREMIUM }}
      className="text-center mb-12 sm:mb-16"
    >
      <h1
        className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1917] dark:text-white mb-4 tracking-tight"
        style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="text-base sm:text-lg text-[#6B6560] dark:text-[#9E9890]">
          {subtitle}
        </p>
      )}
    </motion.div>
  )
}

// ─── Clean SVG Icon Components ────────────────────────────────────────────────

export function SpeakIcon() {
  return (
    <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  )
}

export function BuildIcon() {
  return (
    <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  )
}

export function ImproveIcon() {
  return (
    <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
  )
}
