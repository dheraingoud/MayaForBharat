'use client'

import { useEffect, useRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * ScrollReveal — IntersectionObserver-based scroll entry animation
 * 
 * Per high-end-visual-design skill §5C: "Elements never appear statically on load.
 * As they enter the viewport, they must execute a gentle, heavy fade-up."
 * 
 * Default animation: translate-y-16 blur-md opacity-0 → translate-y-0 blur-0 opacity-100
 * Uses custom cubic-bezier from our design system — never ease-in-out.
 * 
 * Uses IntersectionObserver (not window.addEventListener('scroll') — that's banned
 * per both design skills for causing continuous reflows).
 */

interface ScrollRevealProps {
  children: ReactNode
  className?: string
  /** Delay in ms before the animation starts after intersection */
  delay?: number
  /** Threshold (0-1) for how much of the element must be visible */
  threshold?: number
  /** Whether to only trigger once */
  once?: boolean
  /** Stagger index for cascading reveals (0-based) */
  staggerIndex?: number
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
  threshold = 0.1,
  once = true,
  staggerIndex,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Respect prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mediaQuery.matches) {
      el.classList.add('revealed')
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Apply delay if specified
          const totalDelay = delay + (staggerIndex ?? 0) * 80
          if (totalDelay > 0) {
            setTimeout(() => {
              el.classList.add('revealed')
            }, totalDelay)
          } else {
            el.classList.add('revealed')
          }

          if (once) {
            observer.unobserve(el)
          }
        } else if (!once) {
          el.classList.remove('revealed')
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    )

    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [delay, threshold, once, staggerIndex])

  return (
    <div
      ref={ref}
      className={cn('reveal-on-scroll', className)}
      style={
        staggerIndex !== undefined
          ? ({ '--stagger-index': staggerIndex } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  )
}

/**
 * Convenience wrapper that applies stagger to a list of children.
 * Each direct child gets an incrementing stagger index.
 */
interface StaggerRevealProps {
  children: ReactNode[]
  className?: string
  /** Base delay before the stagger cascade begins */
  baseDelay?: number
  /** Delay between each child in ms */
  interval?: number
}

export function StaggerReveal({
  children,
  className,
  baseDelay = 0,
  interval = 80,
}: StaggerRevealProps) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <ScrollReveal key={i} delay={baseDelay} staggerIndex={i}>
          {child}
        </ScrollReveal>
      ))}
    </div>
  )
}
