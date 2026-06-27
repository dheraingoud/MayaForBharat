'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Double-Bezel (Doppelrand) Container
 * 
 * Implements the nested architecture from the high-end-visual-design skill §4A:
 * - Outer Shell: subtle background, hairline border, padding, large radius
 * - Inner Core: own background, inner highlight shadow, concentric smaller radius
 * 
 * This creates the illusion of a physical, machined card — like a glass plate
 * sitting in an aluminum tray.
 */

interface DoubleBezelProps {
  children: ReactNode
  className?: string
  innerClassName?: string
  /** Controls the overall size feel */
  size?: 'sm' | 'md' | 'lg'
  /** Whether to show the hover shadow lift */
  hoverable?: boolean
  /** onClick handler (makes the entire bezel clickable) */
  onClick?: () => void
}

const sizeMap = {
  sm: {
    outerPadding: 'p-[3px]',
    outerRadius: 'rounded-2xl',
    innerRadius: 'rounded-[calc(1rem-3px)]',
    innerPadding: 'p-4 sm:p-5',
  },
  md: {
    outerPadding: 'p-1.5',
    outerRadius: 'rounded-[2rem]',
    innerRadius: 'rounded-[calc(2rem-0.375rem)]',
    innerPadding: 'p-6 sm:p-8',
  },
  lg: {
    outerPadding: 'p-2',
    outerRadius: 'rounded-[2.5rem]',
    innerRadius: 'rounded-[calc(2.5rem-0.5rem)]',
    innerPadding: 'p-8 sm:p-10',
  },
} as const

export function DoubleBezel({
  children,
  className,
  innerClassName,
  size = 'md',
  hoverable = true,
  onClick,
}: DoubleBezelProps) {
  const s = sizeMap[size]

  return (
    <div
      className={cn(
        // Outer shell
        s.outerPadding,
        s.outerRadius,
        'bg-black/[0.02] dark:bg-white/[0.03]',
        'ring-1 ring-black/5 dark:ring-white/[0.08]',
        'shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]',
        'transition-all duration-700',
        'ease-[cubic-bezier(0.32,0.72,0,1)]',
        hoverable && 'hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)]',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      {/* Inner core */}
      <div
        className={cn(
          s.innerRadius,
          s.innerPadding,
          'bg-white dark:bg-[#2A2925]',
          'shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]',
          'overflow-hidden',
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Bezel Card — A simpler variant for content cards that uses
 * the outer shell aesthetic without the nested padding structure.
 * Good for app cards, feature cards, etc.
 */
interface BezelCardProps {
  children: ReactNode
  className?: string
  hoverable?: boolean
  onClick?: () => void
}

export function BezelCard({
  children,
  className,
  hoverable = true,
  onClick,
}: BezelCardProps) {
  return (
    <div
      className={cn(
        'rounded-[2rem]',
        'bg-white dark:bg-[#2A2925]',
        'ring-1 ring-black/5 dark:ring-white/[0.08]',
        'shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]',
        'transition-all duration-700',
        'ease-[cubic-bezier(0.32,0.72,0,1)]',
        hoverable && [
          'hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)]',
          'hover:-translate-y-1',
        ],
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}
