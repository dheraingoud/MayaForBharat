/*
 * WorkbenchLayout — Builder-style layout with bolt.diy WebContainer engine
 *
 * Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │  HEADER (h-11): MAYA logo │ title │ viewport │
 *   ├──────────────┬──┬──────────────────────────-─┤
 *   │  CHAT (30%)  │||│  PREVIEW (70%)             │
 *   │  messages ↕  │  │  WebContainer iframe       │
 *   │  ──────────  │  │  ─────── (optional)        │
 *   │  input (fix) │  │  Terminal (toggled)         │
 *   └──────────────┴──┴────────────────────────────┘
 */

import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useState } from 'react';
import { computed } from 'nanostores';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Monitor, Tablet, Smartphone, Terminal as TerminalIcon } from 'lucide-react';
import { workbenchStore } from '@/lib/workbench/stores/workbench';
import { chatStore } from '@/lib/workbench/stores/chat';
import { streamingState } from '@/lib/workbench/stores/streaming';
import { Preview } from '@/lib/workbench/components/workbench/Preview';
import { TerminalTabs } from '@/lib/workbench/components/workbench/terminal/TerminalTabs';
import { Chat } from '@/lib/workbench/components/chat/Chat.client';
import { ClientOnly } from '@/lib/workbench/components/ui/ClientOnly';
import { ChatDescription } from '@/lib/workbench/persistence/ChatDescription';
import type { ElementInfo } from '@/lib/workbench/components/workbench/Inspector';

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

const VP: Record<ViewportMode, { w: string; max: string; icon: typeof Monitor }> = {
  desktop: { w: '100%', max: '100%', icon: Monitor },
  tablet:  { w: '768px', max: '768px', icon: Tablet },
  mobile:  { w: '375px', max: '375px', icon: Smartphone },
};

// ─── Header Component ──────────────────────────────────────────────────────────

interface WorkbenchHeaderProps {
  viewport: ViewportMode;
  setViewport: (v: ViewportMode) => void;
  showTerminal: boolean;
  onToggleTerminal: () => void;
  isStreaming: boolean;
}

const WorkbenchHeader = memo(({
  viewport,
  setViewport,
  showTerminal,
  onToggleTerminal,
  isStreaming,
}: WorkbenchHeaderProps) => {

  return (
    <header className="h-11 flex items-center justify-between px-2.5 border-b border-white/[0.06] bg-[#1A1917] shrink-0 z-30">

      {/* ── Left: MAYA logo + chat title + status ────────────────── */}
      <div className="flex items-center gap-2 min-w-0">
        <a href="/" className="flex items-center shrink-0">
          <span
            className="text-base font-bold text-white tracking-[0.08em]"
            style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
          >
            MAYA
          </span>
        </a>

        {/* Status dot */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${
            isStreaming
              ? 'bg-amber-400 animate-pulse'
              : 'bg-emerald-400'
          }`} />
          <span className="text-[10px] text-[#6B6560] uppercase tracking-wider font-medium">
            {isStreaming ? 'Building' : 'Ready'}
          </span>
        </div>

        {/* Chat title */}
        <span className="text-[13px] text-[#9E9890] truncate max-w-[200px] hidden md:block" style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}>
          <ClientOnly>{() => <ChatDescription />}</ClientOnly>
        </span>
      </div>

      {/* ── Center: viewport switcher ────────────────────────────── */}
      <div className="flex items-center">
        <div className="flex items-center bg-white/[0.02] ring-1 ring-white/[0.04] rounded-lg p-0.5">
          {(Object.keys(VP) as ViewportMode[]).map((mode) => {
            const Icon = VP[mode].icon;
            return (
              <button
                key={mode}
                onClick={() => setViewport(mode)}
                className={`p-1.5 rounded-md transition-colors ${
                  viewport === mode
                    ? 'bg-[#E8601A]/10 text-[#E8601A]'
                    : 'text-[#6B6560] hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: terminal toggle ───────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onToggleTerminal}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-all ${
            showTerminal
              ? 'bg-[#E8601A]/10 text-[#E8601A] ring-1 ring-[#E8601A]/20'
              : 'text-[#6B6560] hover:text-[#F5F4F0] hover:bg-white/[0.04]'
          }`}
        >
          <TerminalIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="hidden sm:inline">Terminal</span>
        </button>
      </div>
    </header>
  );
});

WorkbenchHeader.displayName = 'WorkbenchHeader';

// ─── Preview Panel (right side) ────────────────────────────────────────────────

interface PreviewPanelProps {
  viewport: ViewportMode;
  setSelectedElement?: (element: ElementInfo | null) => void;
}

const PreviewPanel = memo(({ viewport, setSelectedElement }: PreviewPanelProps) => {
  const hasPreview = useStore(computed(workbenchStore.previews, (p) => p.length > 0));
  const streaming = useStore(streamingState);

  const vp = VP[viewport];

  return (
    <div className="h-full bg-[#111110] flex flex-col overflow-hidden">
      {/* Preview area */}
      <div className="flex-1 min-h-0 relative bg-[#0A0A09] overflow-hidden flex items-start justify-center">
        {hasPreview ? (
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{
              width: viewport === 'desktop' ? '100%' : vp.max,
              maxWidth: vp.max,
            }}
          >
            <div
              className={`h-full mx-auto transition-all duration-300 ease-out ${
                viewport !== 'desktop'
                  ? 'my-3 rounded-xl ring-1 ring-white/[0.06] shadow-2xl overflow-hidden'
                  : ''
              }`}
              style={{
                width: viewport === 'desktop' ? '100%' : vp.w,
                maxWidth: vp.max,
              }}
            >
              <Preview setSelectedElement={setSelectedElement} />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {streaming ? (
              /* Building skeleton — shimmer effect */
              <div className="w-full max-w-sm p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg" style={{ background: 'linear-gradient(90deg, #1A1917 0%, #1A1917 30%, #252320 50%, #1A1917 70%, #1A1917 100%)', backgroundSize: '200% 100%', animation: 'shimmer-sweep 1.8s ease-in-out infinite' }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded w-32" style={{ background: 'linear-gradient(90deg, #1A1917 0%, #1A1917 30%, #252320 50%, #1A1917 70%, #1A1917 100%)', backgroundSize: '200% 100%', animation: 'shimmer-sweep 1.8s ease-in-out infinite' }} />
                    <div className="h-2.5 rounded w-20" style={{ background: 'linear-gradient(90deg, #1A1917 0%, #1A1917 30%, #252320 50%, #1A1917 70%, #1A1917 100%)', backgroundSize: '200% 100%', animation: 'shimmer-sweep 1.8s ease-in-out infinite', animationDelay: '100ms' }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {[1,2,3].map(i => <div key={i} className="h-16 rounded-lg" style={{ background: 'linear-gradient(90deg, #1A1917 0%, #1A1917 30%, #252320 50%, #1A1917 70%, #1A1917 100%)', backgroundSize: '200% 100%', animation: 'shimmer-sweep 1.8s ease-in-out infinite', animationDelay: `${i * 150}ms` }} />)}
                </div>
                <div className="h-28 rounded-lg" style={{ background: 'linear-gradient(90deg, #1A1917 0%, #1A1917 30%, #252320 50%, #1A1917 70%, #1A1917 100%)', backgroundSize: '200% 100%', animation: 'shimmer-sweep 1.8s ease-in-out infinite', animationDelay: '200ms' }} />
                <div className="space-y-2">
                  {[1,2,3].map(i => <div key={i} className="h-8 rounded-md" style={{ width: `${90 - i * 12}%`, background: 'linear-gradient(90deg, #1A1917 0%, #1A1917 30%, #252320 50%, #1A1917 70%, #1A1917 100%)', backgroundSize: '200% 100%', animation: 'shimmer-sweep 1.8s ease-in-out infinite', animationDelay: `${i * 100}ms` }} />)}
                </div>
                <style jsx>{`
                  @keyframes shimmer-sweep {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                  }
                `}</style>
              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1A1917] flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-[#3A3835]" strokeWidth={1.5} />
                </div>
                <p className="text-[11px] text-[#3A3835]">Preview will appear here</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

PreviewPanel.displayName = 'PreviewPanel';

// ─── Main Layout ────────────────────────────────────────────────────────────────

export const WorkbenchLayout = memo(() => {
  const [viewport, setViewport] = useState<ViewportMode>('desktop');
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
  const showTerminal = useStore(workbenchStore.showTerminal);
  const streaming = useStore(streamingState);

  // Auto-show workbench (it's always visible in this layout, no toggle needed)
  useEffect(() => {
    workbenchStore.showWorkbench.set(true);
    chatStore.setKey('started', true);
  }, []);

  // Auto-show terminal when streaming starts
  useEffect(() => {
    if (streaming) {
      workbenchStore.toggleTerminal(true);
    }
  }, [streaming]);

  const handleToggleTerminal = useCallback(() => {
    workbenchStore.toggleTerminal(!showTerminal);
  }, [showTerminal]);

  return (
    <div className="h-[100dvh] w-screen bg-[#111110] flex flex-col overflow-hidden text-[#F5F4F0]">
      {/* ═══ HEADER ═══════════════════════════════════════════════════ */}
      <WorkbenchHeader
        viewport={viewport}
        setViewport={setViewport}
        showTerminal={showTerminal}
        onToggleTerminal={handleToggleTerminal}
        isStreaming={streaming}
      />

      {/* ═══ MAIN CONTENT ═════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">

          {/* ── Left: Chat ────────────────────────────────────────── */}
          <Panel defaultSize={30} minSize={18} maxSize={50}>
            <div className="h-full overflow-hidden bg-[#111110]">
              <Chat hideWorkbench hideMenu />
            </div>
          </Panel>

          <PanelResizeHandle className="relative flex w-px items-center justify-center cursor-col-resize bg-white/[0.04] hover:bg-[#E8601A]/20 active:bg-[#E8601A]/30 transition-colors duration-150 after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2" />

          {/* ── Right: Preview + Terminal ──────────────────────────── */}
          <Panel defaultSize={70}>
            <PanelGroup direction="vertical" className="h-full">
              {/* Preview */}
              <Panel defaultSize={showTerminal ? 75 : 100} minSize={30}>
                <PreviewPanel
                  viewport={viewport}
                  setSelectedElement={setSelectedElement}
                />
              </Panel>

              {/* Terminal (toggled) — TerminalTabs renders its own Panel */}
              <PanelResizeHandle className="relative flex h-px items-center justify-center cursor-row-resize bg-white/[0.04] hover:bg-[#E8601A]/20 active:bg-[#E8601A]/30 transition-colors duration-150" />
              <TerminalTabs />
            </PanelGroup>
          </Panel>

        </PanelGroup>
      </div>
    </div>
  );
});

WorkbenchLayout.displayName = 'WorkbenchLayout';
