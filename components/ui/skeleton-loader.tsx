'use client'

import { cn } from '@/lib/utils'

/**
 * Skeleton Loader — Layout-matching loading placeholders
 * 
 * Per design-taste-frontend-v1 Rule 5: "Skeletal loaders matching layout sizes
 * (avoid generic circular spinners)."
 * 
 * Uses CSS-only shimmer animation for zero-JS performance.
 */

interface SkeletonProps {
  className?: string
}

/** Base skeleton block with shimmer */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'skeleton-shimmer rounded-xl',
        className
      )}
      aria-hidden="true"
    />
  )
}

/** Skeleton matching an app card layout */
export function SkeletonCard() {
  return (
    <div className="rounded-[2rem] ring-1 ring-black/5 dark:ring-white/[0.08] overflow-hidden bg-white dark:bg-[#2A2925]">
      {/* Preview area */}
      <Skeleton className="aspect-video rounded-none" />
      {/* Content area */}
      <div className="p-5 space-y-3">
        <Skeleton className="h-5 w-3/4 rounded-lg" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <div className="pt-4 border-t border-[#E4E1DA] dark:border-white/10 flex items-center justify-between">
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-4 w-16 rounded-md" />
        </div>
      </div>
    </div>
  )
}

/** Skeleton matching a text block */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-3.5 rounded-md',
            i === lines - 1 ? 'w-2/3' : 'w-full'
          )}
        />
      ))}
    </div>
  )
}

/** Skeleton matching an avatar */
export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  }
  return <Skeleton className={cn('rounded-full', sizeClasses[size])} />
}

/** Skeleton matching a metric/stat card */
export function SkeletonMetric() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <Skeleton className="h-3 w-20 rounded-md" />
      <Skeleton className="h-8 w-32 rounded-lg" />
    </div>
  )
}

/** Skeleton matching a table row */
export function SkeletonTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 py-3" aria-hidden="true">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4 rounded-md',
            i === 0 ? 'w-1/4' : 'flex-1'
          )}
        />
      ))}
    </div>
  )
}

/** Full-page skeleton for the dashboard grid */
export function SkeletonDashboard() {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
