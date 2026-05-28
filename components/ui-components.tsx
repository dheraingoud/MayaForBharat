'use client'

import { motion } from 'framer-motion'
import { ReactNode } from 'react'
import { content } from '@/lib/translations'

// Status Badge Component
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className={`rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1 backdrop-blur-sm ${
        isLive
          ? 'bg-white/90 dark:bg-[#2A2925]/90 text-[#2D7A4F]'
          : 'bg-white/90 dark:bg-[#2A2925]/90 text-[#E8601A]'
      }`}
    >
      <motion.span
        animate={{ scale: [1, 1.2, 1] }}
        transition={{
          duration: isLive ? 2 : 1,
          repeat: Infinity,
        }}
        className={`w-1.5 h-1.5 rounded-full ${
          isLive ? 'bg-[#2D7A4F]' : 'bg-[#E8601A]'
        }`}
      />
      {statusText}
    </motion.div>
  )
}

// App Card Component
export function AppCard({
  name,
  type,
  emoji,
  status,
  updates,
  onOpen,
  language = 'en',
}: {
  name: string
  type: string
  emoji: string
  status: 'live' | 'building'
  updates: number
  onOpen: () => void
  language?: 'en' | 'hi'
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-white dark:bg-[#2A2925] rounded-3xl border border-[#E4E1DA] dark:border-white/10 overflow-hidden cursor-pointer transition-all group hover:shadow-xl hover:shadow-[#E8601A]/20 dark:hover:shadow-[#E8601A]/10"
    >
      {/* Preview */}
      <div className="aspect-video bg-gradient-to-br from-[#E8601A]/10 to-[#E8601A]/5 dark:from-[#E8601A]/20 dark:to-[#E8601A]/10 flex items-center justify-center text-6xl sm:text-7xl relative overflow-hidden">
        {emoji}

        {/* Status Badge */}
        <div className="absolute top-3 left-3">
          <StatusBadge status={status} language={language} />
        </div>
      </div>

      {/* Info */}
      <div className="p-5">
        <h3 className="font-bold text-[#1A1917] dark:text-white mb-2 text-lg">
          {name}
        </h3>

        <span className="inline-block px-3 py-1 bg-[#FDF0E8] dark:bg-[#E8601A]/20 text-[#E8601A] text-xs font-medium rounded-full mb-4">
          {type}
        </span>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#E4E1DA] dark:border-white/10">
          <div className="flex items-center gap-2 text-xs text-[#6B6560] dark:text-[#9E9890]">
            <span className="text-[10px]">●</span>
            <span>
              {updates} {content[language].uiComponents.updates}
            </span>
          </div>
          <button
            onClick={onOpen}
            className="text-[#E8601A] text-xs font-medium hover:underline group-hover:underline"
          >
            {content[language].uiComponents.open} →
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// Feature Card Component
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
      transition={{ duration: 0.6, delay: index * 0.1 }}
      viewport={{ once: true }}
      whileHover={{ y: -4 }}
      className="group p-8 sm:p-10 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#2A2925] border border-[#E4E1DA] dark:border-white/10 hover:border-[#E8601A] dark:hover:border-[#E8601A] transition-all duration-300 cursor-pointer"
    >
      <div className="text-4xl sm:text-5xl mb-5 sm:mb-6">{iconComponent}</div>
      <h3
        className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-[#1A1917] dark:text-white"
        style={{ fontFamily: 'var(--font-sora)' }}
      >
        {title}
      </h3>
      <p className="text-sm sm:text-base text-[#6B6560] dark:text-[#9E9890] leading-relaxed">
        {description}
      </p>
    </motion.div>
  )
}

// Mic Button Component
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
      {/* Ripple Animation */}
      {(isListening || isProcessing) && (
        <>
          <motion.div
            animate={{ scale: [1, 2.2], opacity: [0.8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full border-2 border-[#E8601A] opacity-50"
          />
          <motion.div
            animate={{ scale: [1, 2], opacity: [0.6, 0] }}
            transition={{ duration: 2, delay: 0.3, repeat: Infinity }}
            className="absolute inset-0 rounded-full border-2 border-[#E8601A] opacity-30"
          />
        </>
      )}

      {/* Main Button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        onClick={onClick}
        disabled={isProcessing}
        className={`relative w-32 h-32 sm:w-40 sm:h-40 rounded-full font-semibold text-white font-medium transition-all duration-300 shadow-2xl flex items-center justify-center text-base sm:text-lg ${
          isListening
            ? 'bg-red-500 hover:bg-red-600 animate-pulse'
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
        <span>
          {isProcessing
            ? content[language].uiComponents.processing
            : isListening
              ? content[language].uiComponents.listening
              : content[language].uiComponents.speak}
        </span>
      </motion.button>

      {/* Waveform Bars */}
      {isListening && (
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          {[...Array(7)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ height: ['20px', '60px', '20px'] }}
              transition={{
                duration: 0.5,
                delay: i * 0.05,
                repeat: Infinity,
              }}
              className="w-1 rounded-full bg-white opacity-60"
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}

// Transcription Result Component
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
      transition={{ duration: 0.6 }}
      className="w-full max-w-2xl mx-auto space-y-6"
    >
      {/* Native Language Result */}
      <div className="bg-white dark:bg-[#2A2925] rounded-2xl border border-[#E4E1DA] dark:border-white/10 p-6">
        <p className="text-xs font-semibold text-[#6B6560] dark:text-[#9E9890] mb-3 uppercase tracking-wider">
          {content[language].uiComponents.yourLanguage}
        </p>
        <p className="text-base sm:text-lg text-[#1A1917] dark:text-white leading-relaxed">
          {nativeText}
        </p>
      </div>

      {/* English Translation */}
      <div className="bg-[#F5F4F0] dark:bg-[#3A3530] rounded-2xl border border-[#E4E1DA] dark:border-white/5 p-6">
        <p className="text-xs font-semibold text-[#6B6560] dark:text-[#9E9890] mb-3 uppercase tracking-wider">
          {content[language].uiComponents.inEnglish}
        </p>
        <p className="text-base sm:text-lg text-[#1A1917] dark:text-[#E5E5E0] leading-relaxed">
          {englishText}
        </p>
      </div>

      {/* Try Again Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onTryAgain}
        className="w-full bg-[#E8601A] hover:bg-[#C94E12] text-white rounded-full py-3 font-semibold transition-colors"
      >
        {content[language].uiComponents.tryAgain}
      </motion.button>
    </motion.div>
  )
}

// Page Header Component
export function PageHeader({
  title,
  subtitle,
  language = 'en',
}: {
  title: string
  subtitle?: string
  language?: 'en' | 'hi'
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="text-center mb-12 sm:mb-16"
    >
      <h1
        className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#1A1917] dark:text-white mb-4"
        style={{ fontFamily: 'var(--font-sora)' }}
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

// Icon Components (replacing emojis)
export function SpeakIcon() {
  return (
    <svg
      className="w-8 h-8 sm:w-10 sm:h-10"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19 13m-7 4v2m0-12V4m0 8a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  )
}

export function BuildIcon() {
  return (
    <svg
      className="w-8 h-8 sm:w-10 sm:h-10"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  )
}

export function ImproveIcon() {
  return (
    <svg
      className="w-8 h-8 sm:w-10 sm:h-10"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m0 0l-2-1m2 1v2.5M14 4l-2 1m0 0l-2-1m2 1v2.5"
      />
    </svg>
  )
}
