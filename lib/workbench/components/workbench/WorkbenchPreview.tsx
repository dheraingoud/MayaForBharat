'use client'

/**
 * WorkbenchPreview — Builder's gorgeous browser chrome + WebContainer preview
 *
 * Visual design: From app/[id]/page.tsx (red/yellow/green dots, URL bar, refresh, external link)
 * Engine: Reads from workbenchStore.previews (WebContainer ports)
 * Viewport: Switcher integrated into URL bar (right side)
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { ExternalLink, RefreshCw, Loader2, Monitor, Tablet, Smartphone } from 'lucide-react'
import { workbenchStore } from '@/lib/workbench/stores/workbench'
import { streamingState } from '@/lib/workbench/stores/streaming'

type ViewportMode = 'desktop' | 'tablet' | 'mobile'

const VP_CONFIG: Record<ViewportMode, { w: string; max: string; icon: typeof Monitor }> = {
  desktop: { w: '100%', max: '100%', icon: Monitor },
  tablet:  { w: '768px', max: '768px', icon: Tablet },
  mobile:  { w: '375px', max: '375px', icon: Smartphone },
}

interface WorkbenchPreviewProps {
  viewport?: ViewportMode
  viewportSetter?: (mode: ViewportMode) => void
}

export const WorkbenchPreview = memo(({ viewport = 'desktop', viewportSetter }: WorkbenchPreviewProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [activePreviewIndex, setActivePreviewIndex] = useState(0)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const hasSelectedPreview = useRef(false)
  const previews = useStore(workbenchStore.previews)
  const isStreaming = useStore(streamingState)
  const activePreview = previews[activePreviewIndex]

  const [iframeUrl, setIframeUrl] = useState<string | undefined>()

  // Track active preview URL
  useEffect(() => {
    if (!activePreview) {
      setIframeUrl(undefined)
      setIframeLoaded(false)
      return
    }
    setIframeUrl(activePreview.baseUrl)
    setIframeLoaded(false)
  }, [activePreview])

  // ─── Iframe error capture: listen for runtime errors from the preview ─────
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Handle error reports from preview iframe
      if (event.data?.type === 'PREVIEW_ERROR' || event.data?.type === 'bolt:runtime-error') {
        const errorData = event.data
        const artifact = workbenchStore.firstArtifact
        if (artifact?.runner) {
          artifact.runner.handlePreviewError({
            message: errorData.message || errorData.error || 'Unknown preview error',
            stack: errorData.stack,
            source: errorData.source || 'preview',
          })
        }
      }
    }

    // Also listen for iframe load errors via the iframe's error event
    const iframe = iframeRef.current
    const handleIframeError = () => {
      const artifact = workbenchStore.firstArtifact
      if (artifact?.runner) {
        artifact.runner.handlePreviewError({
          message: 'Preview iframe failed to load — possible compilation error',
          source: 'preview',
        })
      }
    }

    window.addEventListener('message', handleMessage)
    iframe?.addEventListener('error', handleIframeError)

    return () => {
      window.removeEventListener('message', handleMessage)
      iframe?.removeEventListener('error', handleIframeError)
    }
  }, [])

  // Auto-select lowest port
  useEffect(() => {
    if (previews.length > 1 && !hasSelectedPreview.current) {
      const minPortIndex = previews.reduce((minIdx, preview, idx, arr) =>
        preview.port < arr[minIdx].port ? idx : minIdx, 0)
      setActivePreviewIndex(minPortIndex)
    }
  }, [previews])

  const reloadPreview = useCallback(() => {
    if (iframeRef.current) {
      setIframeLoaded(false)
      iframeRef.current.src = iframeRef.current.src
    }
  }, [])

  const vp = VP_CONFIG[viewport]

  return (
    <div className="h-full bg-[#111110] flex flex-col overflow-hidden">
      {/* ── Builder's gorgeous browser chrome ────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#161514] border-b border-white/[0.06] shrink-0">
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        </div>

        {/* URL bar + viewport + controls */}
        <div className="flex-1 flex items-center gap-1.5">
          <button
            onClick={reloadPreview}
            disabled={!iframeUrl}
            className="p-0.5 text-[#6B6560] hover:text-white rounded transition-colors disabled:opacity-25 shrink-0"
          >
            <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
          </button>

          <div className="flex-1 min-w-0 px-2.5 py-[3px] bg-[#1A1917] ring-1 ring-white/[0.04] rounded-md text-[10px] text-[#6B6560] truncate font-mono flex items-center gap-1.5">
            {!iframeUrl && isStreaming ? (
              <><span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" /><span className="text-amber-400/80">Building app...</span></>
            ) : !iframeUrl ? (
              <><span className="w-1 h-1 rounded-full bg-[#3A3835]" /><span>Ready — start building</span></>
            ) : !iframeLoaded ? (
              <><span className="w-1 h-1 rounded-full bg-[#E8601A] animate-pulse" /><span className="text-[#E8601A]/80">Loading preview...</span></>
            ) : (
              <><span className="w-1 h-1 rounded-full bg-emerald-400" /><span>{iframeUrl.replace(/^https?:\/\/[^/]+/, '') || '/'}</span></>
            )}
          </div>

          {/* Port selector (when multiple ports) */}
          {previews.length > 1 && (
            <select
              value={activePreviewIndex}
              onChange={(e) => {
                const idx = Number(e.target.value)
                setActivePreviewIndex(idx)
                hasSelectedPreview.current = true
              }}
              className="px-1.5 py-0.5 bg-[#1A1917] ring-1 ring-white/[0.04] rounded-md text-[10px] text-[#6B6560] font-mono outline-none shrink-0"
            >
              {previews.map((p, i) => (
                <option key={i} value={i}>:{p.port}</option>
              ))}
            </select>
          )}

          {/* Viewport switcher — compact, inside URL bar area */}
          {viewportSetter && (
            <div className="flex items-center bg-white/[0.02] ring-1 ring-white/[0.04] rounded-md p-px shrink-0">
              {(Object.keys(VP_CONFIG) as ViewportMode[]).map((mode) => {
                const Icon = VP_CONFIG[mode].icon
                return (
                  <button
                    key={mode}
                    onClick={() => viewportSetter(mode)}
                    className={`p-1 rounded transition-colors ${viewport === mode ? 'bg-[#E8601A]/10 text-[#E8601A]' : 'text-[#6B6560] hover:text-white'}`}
                    title={mode.charAt(0).toUpperCase() + mode.slice(1)}
                  >
                    <Icon className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                )
              })}
            </div>
          )}

          {iframeUrl && (
            <a
              href={iframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-0.5 text-[#6B6560] hover:text-white rounded transition-colors shrink-0"
            >
              <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
            </a>
          )}
        </div>
      </div>

      {/* ── Iframe viewport ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative bg-[#0A0A09] overflow-hidden flex items-start justify-center">
        {/* Loading state — shimmer skeleton (not bounce) */}
        {!iframeUrl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111110] z-10">
            <div className="w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg shimmer-block" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 shimmer-block rounded w-32" />
                  <div className="h-2.5 shimmer-block rounded w-20" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg shimmer-block" style={{ animationDelay: `${i * 150}ms` }} />)}
              </div>
              <div className="h-28 rounded-lg shimmer-block" style={{ animationDelay: '200ms' }} />
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-8 rounded-md shimmer-block" style={{ width: `${90 - i * 12}%`, animationDelay: `${i * 100}ms` }} />)}
              </div>
            </div>
            <style jsx>{`
              .shimmer-block {
                background: linear-gradient(
                  90deg,
                  #1A1917 0%,
                  #1A1917 30%,
                  #252320 50%,
                  #1A1917 70%,
                  #1A1917 100%
                );
                background-size: 200% 100%;
                animation: shimmer-sweep 1.8s ease-in-out infinite;
              }
              @keyframes shimmer-sweep {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
            `}</style>
          </div>
        ) : !iframeLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#111110] z-10">
            <Loader2 className="w-5 h-5 animate-spin text-[#E8601A]" />
          </div>
        ) : null}

        {/* Iframe */}
        {iframeUrl && (
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{
              width: viewport === 'desktop' ? '100%' : vp.max,
              maxWidth: vp.max,
            }}
          >
            <div
              className={`h-full mx-auto transition-all duration-300 ease-out ${
                viewport !== 'desktop' ? 'my-3 rounded-xl ring-1 ring-white/[0.06] shadow-2xl overflow-hidden' : ''
              }`}
              style={{
                width: viewport === 'desktop' ? '100%' : vp.w,
                maxWidth: vp.max,
              }}
            >
              <iframe
                ref={iframeRef}
                src={iframeUrl}
                className="w-full h-full border-0 bg-white"
                onLoad={() => setIframeLoaded(true)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-downloads allow-top-navigation-by-user-activation"
                allow="cross-origin-isolated"
                title="Preview"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

WorkbenchPreview.displayName = 'WorkbenchPreview'
