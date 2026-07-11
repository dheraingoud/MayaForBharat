'use client'

/*
 * BuilderPage — Gorgeous builder frontend + bolt.diy WebContainer engine
 *
 * VISUAL SHELL: Exact replica of app/app/[id]/page.tsx header, layout, dropdowns
 * ENGINE: bolt.diy useChat + useMessageParser + workbenchStore + WebContainer
 * MESSAGES: bolt.diy Messages component (retains full LLM response rendering)
 * PREVIEW: WorkbenchPreview (builder chrome + WebContainer iframe)
 * TERMINAL: bolt.diy TerminalTabs (collapsible, MAYA-themed)
 * MODEL SELECTOR: Maya Mini / Maya Balanced / Maya Max (internal routing with pricing)
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/app/providers'
import { useCreateGenerateJob } from '@/lib/workbench/hooks/useCreateGenerateJob'
import { useDeployedPreview } from '@/lib/workbench/hooks/useDeployedPreview'
import { Greeting } from '@/lib/workbench/components/chat/Greeting'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Loader2, Search,
  Monitor, Tablet, Smartphone, MessageSquare, Eye,
  ChevronDown, Pencil, Settings, Trash2, X, Check,
  Terminal as TerminalIcon,
  Globe, Paperclip, GitBranch,
} from 'lucide-react'
import { toast } from 'react-toastify'
import { CONTINUE_PROMPT } from '@/lib/workbench/prompts/prompts'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

// ─── MAYA UI: 4-state SendButton (variant=inline drops into toolbar) ──────────
import { SendButton } from '@/lib/workbench/components/chat/SendButton.client'

// ─── bolt.diy engine ──────────────────────────────────────────────────────────
import { useStore } from '@nanostores/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useChat } from '@ai-sdk/react'
import { useMessageParser, usePromptEnhancer, useShortcuts } from '@/lib/workbench/hooks'
import { replayMessages } from '@/lib/workbench/hooks/useMessageParser'
import { chatId as chatIdAtom, description, useChatHistory } from '@/lib/workbench/persistence'
import { chatStore } from '@/lib/workbench/stores/chat'
import { workbenchStore } from '@/lib/workbench/stores/workbench'
import { streamingState, devServerBooting } from '@/lib/workbench/stores/streaming'
import { DEFAULT_MODEL, PROMPT_COOKIE_KEY } from '@/lib/workbench/utils/constants'
import { createScopedLogger } from '@/lib/workbench/utils/logger'
import { createSampler } from '@/lib/workbench/utils/sampler'
import { getTemplates, selectStarterTemplate } from '@/lib/workbench/utils/selectStarterTemplate'
import { logStore } from '@/lib/workbench/stores/logs'
import { filesToArtifacts } from '@/lib/workbench/utils/fileUtils'
import { debounce } from '@/lib/workbench/utils/debounce'
import { useSettings } from '@/lib/workbench/hooks/useSettings'
import type { ProviderInfo } from '@/lib/workbench/types/model'
import Cookies from 'js-cookie'

// ─── bolt.diy UI components (message rendering, terminal) ─────────────────────
import { Messages } from '@/lib/workbench/components/chat/Messages.client'
import { TerminalTabs } from '@/lib/workbench/components/workbench/terminal/TerminalTabs'
import { StickToBottom, useStickToBottomContext } from '@/lib/workbench/hooks'
import { ClientOnly } from '@/lib/workbench/components/ui/ClientOnly'
import ChatAlert from '@/lib/workbench/components/chat/ChatAlert'
// ProgressCompilation import removed — floating build-progress island killed;
// per-file git-diff rows in <Artifact> (lib/workbench/components/chat/Artifact.tsx)
// are the single source of build progress.
// ProgressAnnotation type still used by the progressAnnotations state below;
// the <ProgressCompilation> mount was removed but the derive poll feeds the
// (now-unused) state — kept to avoid broader surgery. Type import stays.
import type { ProgressAnnotation } from '@/lib/workbench/types/context'
import { DeployButton } from '@/lib/workbench/components/deploy/DeployButton'
import { GitHubSnapshotButton } from './GitHubSnapshotButton'

// ─── Our components ───────────────────────────────────────────────────────────
import { WorkbenchPreview } from './WorkbenchPreview'
import { useAutoVerification } from '@/lib/workbench/hooks/useAutoVerification'
import { usePreviewVerification } from '@/lib/workbench/hooks/usePreviewVerification'
// S5: slim silent-build status strip. READS silentPhase/silentCycle atoms;
// renders the in-flight cycle pill (Building · cycle N/15 / Verifying / Vision-
// judging) AND the exhausted Retry/Continue give-up surface (Q3/Q4) — REPLACES
// the full-screen <GenerateJobCard> chat-column mount so the user never sees
// "Building your app" while on the live site (Bug 2026-07-11). Chat + preview
// always render below/alongside the strip; build prose stays suppressed (S1-S5).
import { SilentBuildStrip } from './SilentBuildStrip'

const logger = createScopedLogger('BuilderPage')

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewportMode = 'desktop' | 'tablet' | 'mobile'

// ─── Maya Model Tiers — populated from /api/maya-models at runtime ──────────

interface MayaTier {
  label: string
  model: string
  provider: string
  description: string
  inputPrice: string   // per 1M tokens
  outputPrice: string  // per 1M tokens
}

// Default tiers use NvidiaNIM models from .env (MAYA_MINI / MAYA_FAST / MAYA_MAX)
// These are overridden at runtime from /api/maya-models
const DEFAULT_MAYA_TIERS: MayaTier[] = [
  { label: 'Maya Mini',     model: 'stepfun-ai/step-3.7-flash',     provider: 'NvidiaNIM', description: 'Fast & light',    inputPrice: '$0.25',  outputPrice: '$1.25'  },
  { label: 'Maya Balanced', model: 'deepseek-ai/deepseek-v4-flash',  provider: 'NvidiaNIM', description: 'Balanced',        inputPrice: '$0.50',  outputPrice: '$2.00'  },
  { label: 'Maya Max',      model: 'minimaxai/minimax-m3',           provider: 'NvidiaNIM', description: 'Most capable',    inputPrice: '$1.00',  outputPrice: '$4.00'  },
]

interface AppData {
  id: string; name: string; nameHindi?: string; descriptionEn?: string
  category: string; url: string; projectId: string
  createdAt: string; status: 'live' | 'building' | 'preview'
  version?: number
  specJson?: string | null
}

interface BuilderPageProps {
  appId?: string
}

// ─── Sampler for message processing ──────────────────────────────────────────

const processSampledMessages = createSampler(
  (options: {
    messages: UIMessage[]
    initialMessages: UIMessage[]
    isLoading: boolean
    parseMessages: (messages: UIMessage[], isLoading: boolean) => void
    storeMessageHistory: (messages: UIMessage[]) => Promise<void>
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options
    parseMessages(messages, isLoading)
    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => logger.error('Failed to store messages', error))
    }
  },
  50,
)

// ═════════════════════════════════════════════════════════════════════════════
// BuilderPage
// ═════════════════════════════════════════════════════════════════════════════

// AI SDK v6: UIMessage no longer carries `content`. Text lives in `parts[]`.
// Helper reads text from parts (preferred) and falls back to legacy `content`
// for any code paths that still emit it.
function extractMessageText(message: UIMessage): string {
  if ('parts' in message && Array.isArray((message as any).parts)) {
    return (message as any).parts
      .filter((p: any) => p?.type === 'text' && typeof p.text === 'string')
      .map((p: any) => p.text)
      .join('')
  }
  const legacy = (message as any).content
  return typeof legacy === 'string' ? legacy : ''
}

export function BuilderPage({ appId }: BuilderPageProps) {
  const router = useRouter()
  const { language } = useLanguage()
  const createJob = useCreateGenerateJob()

  // Deployed-preview-on-reopen (Bug 2026-07-08): when the apps row is
  // `deployed` with a vercelUrl, skip the local `npm run dev` boot so the
  // preview loads the deployed URL directly (Preview.tsx prefers vercelUrl
  // when no local preview exists). Stored in a ref so the AutoStart +5s
  // timeout reads the latest query result, not the mount-closure snapshot.
  const deployed = useDeployedPreview(appId)
  const deployedRef = useRef(deployed)
  deployedRef.current = deployed

  const [mounted, setMounted] = useState(false)
  const [app, setApp] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(!!appId)

  // Viewport
  const [viewport, setViewport] = useState<ViewportMode>('desktop')

  // Mobile
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat')
  const [isMobile, setIsMobile] = useState(false)

  // Dropdowns
  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const projectMenuRef = useRef<HTMLDivElement>(null)

  // ─── bolt.diy engine state ──────────────────────────────────────────────────
  const showTerminal = useStore(workbenchStore.showTerminal)
  const streaming = useStore(streamingState)
  const actionAlert = useStore(workbenchStore.alert)

  // ─── Silent autonomous build (S2) ───────────────────────────────────────────
  // Once the user sends the FIRST build prompt in BuilderPage, zero further chat
  // bubbles / toasts / error cards / red status dot may surface until a perfect
  // preview (runtime-clean AND vision-passed) — or give-up at 15 verify cycles.
  // silentBuildActive gates every visible surfacing; silentCycle/silentPhase
  // drive the single progress card. Refs mirror the atoms for stale-free reads
  // inside async/onFinish/preview-health closures (the pipelineInstructionsRef
  // pattern). See docs/superpowers/specs/2026-07-10-silent-autonomous-build-design.md.
  const SILENT_MAX_CYCLES = 15 // Q3 give-up cap (verify/auto-fix rounds).
  const silentBuildActive = useStore(workbenchStore.silentBuildActive)
  const silentCycle = useStore(workbenchStore.silentCycle)
  const silentPhase = useStore(workbenchStore.silentPhase)
  const silentBuildActiveRef = useRef(false)
  const silentCycleRef = useRef(1)
  // visionPassedRef — set by the onVerifyCycle callback when the vision judge
  // passes ALL routes this round; cleared on any failure. The exit-gate effect
  // reads it (runtime-clean AND vision-passed) before clearing silentBuildActive.
  const visionPassedRef = useRef(false)
  // S5: capture the original first build prompt triplet so an exhausted
  // Give-up card "Retry" (Q3: re-run the autonomous loop from cycle 1) can
  // re-arm the atoms + re-send the build as a HIDDEN pipeline send, exactly
  // like the auto-fix/verify breadcrumbs (visible breadcrumb strips to ''
  // via UserMessage autoFixPreambleRegex → zero user bubbles). Without this,
  // exhausted Retry is a no-op, and the loose jobsRowRef only carries the
  // detached Convex row triplet, not what the in-browser stream was fed.
  const originalBuildPromptRef = useRef<string | null>(null)
  const originalBuildModelRef = useRef<string | null>(null)
  const originalBuildProviderRef = useRef<string | null>(null)
  useEffect(() => {
    silentBuildActiveRef.current = silentBuildActive
    silentCycleRef.current = silentCycle
  }, [silentBuildActive, silentCycle])

  // ─── Maya model tier ────────────────────────────────────────────────────────
  // Default: Maya Mini (index 0, stepfun-ai/step-3.7-flash). NOT index 1
  // "Balanced" = deepseek-ai/deepseek-v4-flash — the fast tier, which NVIDIA
  // returns 400 "DEGRADED function cannot be invoked" on (and the plan's M7
  // rule forbids: "NOT fast — confirmed 404/degraded across all keys"). Every
  // fresh /workbench load previously defaulted to the broken tier → first send
  // 400'd. Mini is the approved, proven-working cheap default.
  const [selectedTier, setSelectedTier] = useState(0)
  const [showTierMenu, setShowTierMenu] = useState(false)
  const tierMenuRef = useRef<HTMLDivElement>(null)
  const [mayaTiers, setMayaTiers] = useState<MayaTier[]>(DEFAULT_MAYA_TIERS)
  const activeTier = mayaTiers[selectedTier] ?? mayaTiers[0]

  // ─── Model/Provider (internal routing) ──────────────────────────────────────
  // Initialize from URL params (passed by landing page) → cookies → defaults
  const [model, setModel] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlModel = new URLSearchParams(window.location.search).get('model')
      if (urlModel) return urlModel
    }
    return Cookies.get('selectedModel') || 'deepseek-ai/deepseek-v4-flash'
  })
  const [provider, setProvider] = useState<ProviderInfo>(() => {
    let provName = 'NvidiaNIM'
    if (typeof window !== 'undefined') {
      const urlProv = new URLSearchParams(window.location.search).get('provider')
      if (urlProv) provName = urlProv
      else if (Cookies.get('selectedProvider')) provName = Cookies.get('selectedProvider')!
    }
    return { name: provName, staticModels: [], getApiKeyLink: '' }
  })
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings()

  // ─── Sync model/provider when tier selection changes ─────────────────────────
  useEffect(() => {
    const tier = mayaTiers[selectedTier]
    if (tier) {
      setModel(tier.model)
      setProvider(prev => ({ ...prev, name: tier.provider }))
      Cookies.set('selectedModel', tier.model)
      Cookies.set('selectedProvider', tier.provider)
    }
  }, [selectedTier, mayaTiers])

  // ─── Chat engine (bolt.diy useChat) ─────────────────────────────────────────
  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [fakeLoading, setFakeLoading] = useState(false)
  const searchParams = useSearchParams()

  // ─── Auto-retry state ────────────────────────────────────────────────────────
  // Bulletproof model recovery: transient errors use 2/5/10s; NIM quota errors use
  // 30/90/240s (cooldown across the worker's rate-limit window). MAX_CHAT_RETRIES
  // extended on quota path because the window is minutes, not seconds.
  const retryRef = useRef({ count: 0, lastUserMsg: '', isQuota: false })
  const RETRY_DELAYS = [2000, 5000, 10000]
  const QUOTA_RETRY_DELAYS = [30_000, 90_000, 240_000]
  const QUOTA_MAX_RETRIES = 5
  const TRANSIENT_MAX_RETRIES = 3
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track latest messages for beforeunload flush
  const latestMessagesRef = useRef<UIMessage[]>([])

  // --- LOCAL INPUT STATE (AI SDK v3 no longer manages input) ---
  const [input, setInput] = useState(() => Cookies.get(PROMPT_COOKIE_KEY) || '')
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }, [])

  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id))
  }, [initialMessages])

  // Use a ref to avoid re-rendering on every file change — files are read lazily at send time
  const filesRef = useRef(workbenchStore.files.get())
  useEffect(() => {
    const unsubscribe = workbenchStore.files.subscribe((value) => {
      filesRef.current = value
    })
    return unsubscribe
  }, [])

  // Build the transport body dynamically so it picks up latest refs
  const transportBodyRef = useRef<() => object>(() => ({}))
  // Hidden pipeline suffix (model tag + plan context + mandatory pipeline block)
  // — cleared after each send so retries that re-read `retryRef.current.lastUserMsg`
  // don't double-inject the same suffix. The chat UI never sees this content.
  const pipelineInstructionsRef = useRef<string>('')
  // Phase C: auto-continue counter for `finishReason==='length'` truncation.
  // Reasoning models burn the token budget inside <reasoning> then cut before
  // the <boltArtifact> lands. We re-prompt with CONTINUE_PROMPT (hidden, same
  // path as auto-fix) up to this cap so the artifact streams on the next turn.
  const continueAttemptRef = useRef<number>(0)
  const CONTINUE_MAX = 3
  transportBodyRef.current = () => ({
    apiKeys,
    files: filesRef.current,
    contextFiles: filesRef.current,
    promptId,
    contextOptimization: contextOptimizationEnabled,
    chatMode: 'build' as const,
    pipelineInstructions: pipelineInstructionsRef.current || undefined,
    appId: appIdRef.current || undefined,
  })

  // AI SDK v6: api/body moved onto a transport object (top-level keys are ignored).
  // Create once; body resolver reads the live ref so it always picks up latest
  // apiKeys/files at send time (Resolvable<object> supports a function).
  const transportRef = useRef<DefaultChatTransport<UIMessage> | null>(null)
  if (!transportRef.current) {
    transportRef.current = new DefaultChatTransport({
      api: '/api/workbench/chat',
      body: () => transportBodyRef.current(),
    })
  }

  const {
    messages,
    status,
    sendMessage: chatSendMessage,
    regenerate,
    stop,
    setMessages,
    error,
    addToolResult,
  } = useChat({
    transport: transportRef.current!,
    messages: initialMessages,
    onError: (e) => {
      const attempt = retryRef.current.count
      const lastMsg = retryRef.current.lastUserMsg

      // Probe the raw provider payload — AI SDK nests real message under
      // messageResponse.body / data.message; fall back to top-level message/status.
      const rawErr =
        (e as any)?.messageResponse?.body ||
        (e as any)?.data?.message ||
        (e as any)?.message ||
        (e as any)?.statusText ||
        ''
      const errText = String(typeof rawErr === 'string' ? rawErr : JSON.stringify(rawErr))
      const isQuota =
        /(resource[\s_-]*exhausted|request\s*limit\s*reached|rate[\s_-]*limit|quota\s*exceed|too\s*many\s*requests)/i.test(
          errText,
        )

      // Bulletproof recovery: longer window + more retries on NIM quota errors.
      const maxAttempts = isQuota ? QUOTA_MAX_RETRIES : TRANSIENT_MAX_RETRIES
      const delayTable = isQuota ? QUOTA_RETRY_DELAYS : RETRY_DELAYS
      const delay = delayTable[attempt] ?? delayTable[delayTable.length - 1] ?? 10000

      if (attempt < maxAttempts && lastMsg) {
        retryRef.current.count++
        retryRef.current.isQuota = isQuota
        const tag = isQuota ? 'QUOTA' : 'TRANSIENT'
        logger.warn(`[AutoRetry ${tag}] Attempt ${attempt + 1}/${maxAttempts} — retrying in ${delay / 1000}s`, e)
        // Clear any stale retry toast before showing the next phase
        toast.dismiss('auto-retry')
        // S2: silent during autonomous build — retries still fire, just invisibly.
        if (!silentBuildActiveRef.current) {
          toast.warn(
            isQuota
              ? `MAYA hit its API rate limit — retrying in ${delay / 1000}s... (${attempt + 1}/${maxAttempts})`
              : `Connection issue. Retrying in ${delay / 1000}s... (${attempt + 1}/${maxAttempts})`,
            {
              autoClose: delay,
              toastId: 'auto-retry',
            },
          )
        }
        retryTimerRef.current = setTimeout(() => {
          if (!streamingState.get()) {
            logger.info(`[AutoRetry ${tag}] Retrying now (attempt ${attempt + 1})`)
            chatSendMessage({ text: lastMsg })
          }
        }, delay)
      } else {
        // Final failure — show persistent error
        setFakeLoading(false)
        retryRef.current.count = 0
        retryRef.current.isQuota = false
        logger.error(`Chat request failed after all retries (quota=${isQuota})`, e)
        // S2: during silent build, never toast an error. Flip the single
        // progress card to its exhausted variant (Retry/Continue) instead so the
        // user has a labeled escape — no bubble, no toast.
        if (silentBuildActiveRef.current) {
          workbenchStore.silentPhase.set('exhausted')
          workbenchStore.silentBuildActive.set(false)
          silentBuildActiveRef.current = false
        } else {
          toast.error(
            isQuota
              ? 'Build paused — API rate limit window exhausted. Send a message to retry.'
              : 'Build paused due to connection issues. Send a message to resume.',
            {
              autoClose: false,
              toastId: 'retry-failed',
            },
          )
        }
      }
    },
    onFinish: ({ message, finishReason }) => {
      retryRef.current.count = 0 // Reset retry counter on success
      logger.debug('Finished streaming')
      logStore.logProvider('Chat response completed', {
        component: 'Chat', action: 'response', model, provider: provider.name,
        messageLength: message ? extractMessageText(message).length : 0,
      })

      // ─── Phase C: auto-continue on token cap ────────────────────────────────
      // finishReason==='length' means the model hit maxOutputTokens mid-emit
      // (reasoning models do this inside <reasoning>, so <boltArtifact> never
      // lands → "generation not happening"). Re-prompt with CONTINUE_PROMPT via
      // the SAME hidden pipeline path as auto-fix: user sees a clean bilingual
      // breadcrumb, the model sees the continue directive server-side. Cap at
      // CONTINUE_MAX to bound runaway. Reset the counter on any non-length finish.
      if (finishReason !== 'length') {
        continueAttemptRef.current = 0
        // Phase B: a non-length finish means the stream completed (probably the
        // auto-fix landed). Clear the in-chat error card so it doesn't linger.
        workbenchStore.buildErrorCard.set(undefined)

        // ─── S5: no-action deadlock watchdog ──────────────────────────────────
        // A prose-only silent stream (finishReason !== 'length', zero bolt
        // file/shell/start actions) leaves workbenchStore.files empty → no WC
        // boot → no preview iframe → usePreviewVerification can't arm →
        // onVerifyCycle never fires → silentCycle never bumps → never reaches
        // the cap → composer stays LOCKED + card stuck "Building" forever. The
        // Q3 cap-and-exhaust ONLY triggers on a verify FAIL; a no-action
        // response produces ZERO cycles. Mirror the onVerifyCycle(false) give-up
        // plumbing (L1225-1246): bump silentCycle; at the cap exhaust (same path
        // as verify-fail); else re-stream a forced-action directive via the
        // hidden pipelineInstructionsRef + a zero-bubble breadcrumb (autoFixPre-
        // ambleRegex now covers "MAYA is rebuilding the app (attempt N/M)…").
        if (
          silentBuildActiveRef.current &&
          Object.keys(workbenchStore.files.get() ?? {}).length === 0
        ) {
          const nextCycle = silentCycleRef.current + 1
          if (nextCycle > SILENT_MAX_CYCLES) {
            workbenchStore.silentPhase.set('exhausted')
            workbenchStore.silentBuildActive.set(false)
            silentBuildActiveRef.current = false
            return
          }
          silentCycleRef.current = nextCycle
          workbenchStore.silentCycle.set(nextCycle)
          workbenchStore.silentPhase.set('building')
          // Forced-action directive → model only (server appends to the user
          // message via pipelineInstructionsRef). Demand a complete artifact so
          // this round emits real file/shell actions instead of prose.
          pipelineInstructionsRef.current =
            '\n\nYour previous response produced NO file actions — the preview never loaded. You MUST emit the complete app NOW using <boltArtifact> with a nested <boltAction type="file"> for every source file and the needed <boltAction type="shell"> commands (install + start). Do not explain or emit prose-only. Output the full artifact immediately.'
          const attempt = nextCycle
          setTimeout(() => {
            trackedSendMessage({ text: `MAYA is rebuilding the app (attempt ${attempt}/${SILENT_MAX_CYCLES})…` })
            setTimeout(() => { pipelineInstructionsRef.current = '' }, 0)
          }, 400)
          return
        }
        return
      }
      if (continueAttemptRef.current >= CONTINUE_MAX) {
        logger.warn(`[Chat] Continuation cap reached (${CONTINUE_MAX}) — surfacing as fallback`)
        // S2: silent build — no token-limit toast; flip the card to exhausted.
        if (silentBuildActiveRef.current) {
          workbenchStore.silentPhase.set('exhausted')
          workbenchStore.silentBuildActive.set(false)
          silentBuildActiveRef.current = false
        } else {
          toast.warning('MAYA hit the token limit; continuing in the next message.', {
            autoClose: 4000, toastId: 'continue-cap',
          })
        }
        continueAttemptRef.current = 0
        return
      }
      continueAttemptRef.current += 1
      const attempt = continueAttemptRef.current
      logger.info(`[Chat] Continuing after length (attempt ${attempt}/${CONTINUE_MAX})`)
      // Hidden injection: breadcrumb visible to user, CONTINUE_PROMPT → model only.
      pipelineInstructionsRef.current = `\n\n${CONTINUE_PROMPT}`
      // Defer so the stream fully closes before we kick the next one.
      setTimeout(() => {
        trackedSendMessage({ text: `MAYA is continuing the build (attempt ${attempt}/${CONTINUE_MAX})…` })
        setTimeout(() => { pipelineInstructionsRef.current = '' }, 0)
      }, 400)
    },
  })

  // Derive isLoading from status for backward compat
  const isLoading = status === 'streaming' || status === 'submitted'

  // AI SDK v6: addToolResult takes `{ tool, toolCallId, output, state }`. Legacy
  // bolt.diy Messages client still calls it with `{ toolCallId, result }`. Wrap
  // so ChatPanel keeps the legacy contract.
  const addToolResultLegacy = useCallback(({ toolCallId, result }: { toolCallId: string; result: any }) => {
    addToolResult({ tool: 'unknown' as any, toolCallId, output: result, state: 'output-available' } as any)
  }, [addToolResult])

  // Tracked send: wraps chatSendMessage to save last message for auto-retry
  const trackedSendMessage = useCallback((opts: { text: string }) => {
    retryRef.current.lastUserMsg = opts.text
    retryRef.current.count = 0
    chatSendMessage(opts)
  }, [chatSendMessage])

  const append = useCallback((msg: { role: string; content: string; parts?: any[] }) => {
    if (msg.role === 'user') {
      trackedSendMessage({ text: msg.content })
    }
  }, [trackedSendMessage])

  const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer()
  const { parsedMessages, parseMessages } = useMessageParser()
  useShortcuts()

  // ─── Process messages through engine parser ─────────────────────────────────
  useEffect(() => {
    chatStore.setKey('started', true)
  }, [])

  useEffect(() => {
    processSampledMessages({
      messages, initialMessages, isLoading, parseMessages, storeMessageHistory,
    })
  }, [messages, isLoading, parseMessages])

  // ─── Keep latest messages ref updated for beforeunload flush ────────────────
  useEffect(() => {
    latestMessagesRef.current = messages
  }, [messages])

  // ─── Streaming state sync ──────────────────────────────────────────────────
  useEffect(() => {
    streamingState.set(isLoading || fakeLoading)
  }, [isLoading, fakeLoading])

  // ─── In-browser chunk-stall watchdog (2026-07-11) ──────────────────────────
  // The detached Convex path (generateJobsHandler) has STALL_TIMEOUT_MS +
  // REASON_CEILING_MS + HARD_TIMEOUT_MS for NIM mid-stream stalls. The
  // in-browser useChat path had no equivalent — stepfun-3.7-flash /
  // deepseek-v4-flash reasoning-only stalls could hang "Thinking…" forever.
  // Use message-length deltas as a chunk-rate proxy. If the latest assistant
  // message text length doesn't grow for STALL_TIMEOUT_MS while isLoading is
  // true, abort via `stop()` and surface a Retry toast. Reasoning-mode trickle
  // emits reasoning deltas but no visible text — this catches that exact
  // pattern (visible text frozen for 60s).
  const lastTextLenRef = useRef(0);
  const streamStartedAtRef = useRef(0);
  const stallToastShownRef = useRef(false);
  useEffect(() => {
    if (!isLoading) {
      // Stream ended — reset all watchdog state.
      lastTextLenRef.current = 0;
      streamStartedAtRef.current = 0;
      stallToastShownRef.current = false;
      return;
    }
    if (streamStartedAtRef.current === 0) {
      streamStartedAtRef.current = Date.now();
    }
    // Snapshot the latest assistant message text length (AI SDK v6 UIMessage
    // has only `.parts`, not `.content` — concat text parts).
    const extractText = (m: any): string => {
      if (!m) return '';
      if (Array.isArray(m.parts)) {
        return m.parts
          .filter((p: any) => p?.type === 'text')
          .map((p: any) => p?.text ?? '')
          .join('');
      }
      return '';
    };
    const lastAssistant = [...messages].reverse().find((m: any) => m.role === 'assistant');
    const lastText = extractText(lastAssistant);
    lastTextLenRef.current = lastText.length;
    const STALL_TIMEOUT_MS = 60_000;
    const tick = setTimeout(() => {
      // Recheck the text length now — if it didn't grow AND isLoading is still
      // true AND we haven't yet thrown the toast, abort and toast.
      const now = Date.now();
      const lastAssistantNow = [...messages].reverse().find((m: any) => m.role === 'assistant');
      const lastTextNow = extractText(lastAssistantNow);
      // No growth since last snapshot AND no growth in initial-start snapshot.
      const noGrowth = lastTextNow.length === lastTextLenRef.current && lastTextNow.length === 0;
      if (noGrowth && isLoading && !stallToastShownRef.current) {
        stallToastShownRef.current = true;
        const seconds = Math.floor((now - streamStartedAtRef.current) / 1000);
        toast.warning('Model stream stalled — auto-aborting. Hit Retry to resume.', {
          toastId: 'in-browser-stall',
          autoClose: 8000,
        });
        logger.warn(`[InBrowserStall] No chunk growth for ${seconds}s — calling stop()`);
        try { stop(); } catch (e) { logger.error('[InBrowserStall] stop() threw', e); }
      }
    }, STALL_TIMEOUT_MS);
    return () => clearTimeout(tick);
  }, [isLoading, messages, stop]);

  // ─── Navigation guard: prevent accidental close/navigation during builds ───
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (streamingState.get()) {
        e.preventDefault()
        e.returnValue = 'Build in progress. Are you sure you want to leave?'
      }
      // Flush messages to IndexedDB on any page unload
      if (latestMessagesRef.current.length > 0) {
        try {
          storeMessageHistory(latestMessagesRef.current)
        } catch {
          // Best-effort flush — can't block the unload
        }
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // Clean up retry timer
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
      }
    }
  }, [storeMessageHistory])

  // ─── Project persistence + app naming on streaming completion ──────────────
  // Uses a ref to detect isLoading transition (true → false) so it has fresh app state.
  // FIX: Use a stable appIdRef that persists across re-renders and component remounts.
  // The old hasSavedRef reset on every remount causing duplicate app creation.
  const wasLoadingRef = useRef(false)
  const appIdRef = useRef<string | null>(appId || null) // Stable ID — never changes once set
  const hasSavedRef = useRef(!!appId) // If we have an appId from props, the app already exists
  const autoRunAttemptsRef = useRef(0)
  const MAX_AUTO_RUN_CYCLES = 3 // Stop early — fatal rebuild cascade if the fix doesn't land
  const incrementalSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Helper: extract messages in Convex-friendly format ──
  const getConvexMessages = useCallback(() => {
    return messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => {
        return {
          role: m.role as 'user' | 'assistant',
          content: extractMessageText(m),
          timestamp: Date.now(),
        }
      })
  }, [messages])

  // ── Helper: resolve a stable app ID ──
  const resolveAppId = useCallback(() => {
    if (appIdRef.current) return appIdRef.current
    const persistedChatId = chatIdAtom.get()
    const currentPathId = window.location.pathname.split('/workbench/')[1]?.split('?')[0]
    const resolved =
      (persistedChatId && persistedChatId !== 'undefined' && persistedChatId !== 'NaN')
        ? persistedChatId
        : (currentPathId && currentPathId !== 'new' && currentPathId !== 'NaN' && currentPathId !== 'undefined')
          ? currentPathId
          : appId || `maya_${Date.now()}`
    appIdRef.current = resolved
    chatIdAtom.set(resolved)
    return resolved
  }, [appId])

  // ── Helper: resolve app name from URL, plan, artifact, or first user message ──
  const resolveAppName = useCallback(() => {
    const urlName = new URLSearchParams(window.location.search).get('name')
    if (urlName) return urlName

    const artifact = workbenchStore.firstArtifact
    if (artifact?.title) return artifact.title

    const firstUserMsg = messages.find(m => m.role === 'user')
    if (firstUserMsg) {
      const raw = extractMessageText(firstUserMsg)
      if (raw) {
        const cleaned = raw
          .replace(/\[Model:.*?\]\s*/g, '')
          .replace(/\[Provider:.*?\]\s*/g, '')
          .replace(/\n*---\s*APP PLAN.*?---\s*END PLAN\s*---[\s\S]*$/g, '')
          .trim()
        const name = cleaned.slice(0, 40).trim() || 'My App'
        return name.length > 35 ? name.slice(0, 35) + '…' : name
      }
    }

    return app?.name || 'New App'
  }, [messages, app?.name])

  // ── IMMEDIATE SAVE: Create app in DB as soon as streaming starts ──
  useEffect(() => {
    if (!isLoading) return
    if (hasSavedRef.current) return
    if (messages.length === 0) return

    // Streaming just started with messages — save immediately
    const appIdToUse = resolveAppId()
    const appName = resolveAppName()
    const convexMessages = getConvexMessages()

    hasSavedRef.current = true
    logger.info(`[Persist:Immediate] Creating app "${appName}" (id: ${appIdToUse}) — streaming started`)

    // Update local app state
    setApp(prev => prev ? { ...prev, id: appIdToUse, name: appName } : null)
    description.set(appName)

    // Save to DB immediately
    fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: appIdToUse,
        name: appName,
        category: app?.category || 'other',
        status: 'building',
        messages: convexMessages,
      }),
    })
      .then(r => { if (r.ok) logger.info('[Persist:Immediate] App saved to DB'); else logger.error(`[Persist:Immediate] Save failed: ${r.status}`) })
      .catch(e => logger.error('[Persist:Immediate] Save error:', e))
  }, [isLoading, messages.length])

  // ── INCREMENTAL SAVE: Save messages every 5s during streaming ──
  useEffect(() => {
    if (isLoading && hasSavedRef.current && appIdRef.current) {
      // Start incremental saves
      if (!incrementalSaveTimerRef.current) {
        incrementalSaveTimerRef.current = setInterval(() => {
          const id = appIdRef.current
          if (!id) return
          const convexMessages = getConvexMessages()
          if (convexMessages.length === 0) return
          logger.debug(`[Persist:Incremental] Saving ${convexMessages.length} messages for ${id}`)
          fetch(`/api/apps/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: convexMessages }),
          }).catch(e => logger.error('[Persist:Incremental] error:', e))
        }, 5000)
      }
    } else {
      // Stop incremental saves when not streaming
      if (incrementalSaveTimerRef.current) {
        clearInterval(incrementalSaveTimerRef.current)
        incrementalSaveTimerRef.current = null
      }
    }
    return () => {
      if (incrementalSaveTimerRef.current) {
        clearInterval(incrementalSaveTimerRef.current)
        incrementalSaveTimerRef.current = null
      }
    }
  }, [isLoading, getConvexMessages])

  // ── POST-STREAM: Final save + auto-run when streaming ends ──
  useEffect(() => {
    if (isLoading) {
      wasLoadingRef.current = true
      return
    }
    if (!wasLoadingRef.current) return
    wasLoadingRef.current = false
    if (!app || messages.length === 0) return

    // ── Auto-run safety net: if model wrote files but never ran install/start ──
    const allArtifacts = workbenchStore.artifacts.get()
    let hasFileActions = false
    let hasShellOrStartActions = false
    let targetArtifactId: string | null = null

    for (const [artifactId, artifact] of Object.entries(allArtifacts)) {
      if (!artifact?.runner) continue
      if (targetArtifactId === null) targetArtifactId = artifactId
      const actions = artifact.runner.actions.get()
      for (const action of Object.values(actions)) {
        if (action.type === 'file') hasFileActions = true
        if (action.type === 'shell' || action.type === 'start') hasShellOrStartActions = true
      }
    }

    if (hasFileActions && !hasShellOrStartActions && autoRunAttemptsRef.current < MAX_AUTO_RUN_CYCLES && targetArtifactId) {
      autoRunAttemptsRef.current += 1
      logger.info(`[AutoRun] Model wrote files but no shell/start actions — injecting pipeline directly (cycle ${autoRunAttemptsRef.current}/${MAX_AUTO_RUN_CYCLES})`)
      toast.info('Auto-starting the project...', { autoClose: 3000, toastId: 'auto-run' })

      // Bug B+C fix: execute the pipeline DIRECTLY against the action runner
      // instead of re-prompting the model with a fake user message. The old
      // approach sent raw <boltAction> XML as a user message — that leaked
      // bolt internals into the chat ("you did not run the dev…") and relied
      // on the model re-emitting the tags, which it often skipped. Direct
      // injection guarantees the commands run and produces zero chat output,
      // so the user only ever sees what they typed. Reuses the same
      // ActionCallbackData shape + execution path the streaming parser uses
      // (useMessageParser onActionClose → workbenchStore.addAction/runAction).
      const synthMessageId = `autorun-${Date.now()}`
      // Dev loop only — no `npm run build` (Vite dev transpiles TS without
      // type-checking, so a production build gate would re-fail on tsc errors
      // and trigger a fatal auto-fix rebuild cascade). Preview loads from dev.
      const pipeline: { type: 'shell' | 'start'; content: string }[] = [
        { type: 'shell', content: 'npm install' },
        { type: 'start', content: 'npm run dev' },
      ]
      setTimeout(() => {
        if (streamingState.get()) return
        for (let i = 0; i < pipeline.length; i++) {
          const step = pipeline[i]
          const data = {
            artifactId: targetArtifactId,
            messageId: synthMessageId,
            actionId: `autorun-${synthMessageId}-${i}`,
            action: { type: step.type, content: step.content } as import('@/lib/workbench/types/actions').BoltAction,
          }
          workbenchStore.addAction(data)
          workbenchStore.runAction(data, false)
        }
      }, 500)
    }

    // ── Final save: update app name + complete messages ──
    const appIdToUse = resolveAppId()
    const convexMessages = getConvexMessages()
    const appName = resolveAppName()

    // Update local name if it was still generic
    if (app.name === 'New App' || app.name === 'new' || app.name === 'New Project') {
      setApp(prev => prev ? { ...prev, name: appName } : null)
      description.set(appName)
    }

    // Sync local app ID
    if (app.id === 'new' || app.id !== appIdToUse) {
      setApp(prev => prev ? { ...prev, id: appIdToUse } : null)
    }

    // Save to DB
    logger.info(`[Persist:Final] Saving ${convexMessages.length} messages for "${appName}" (${appIdToUse})`)
    fetch(`/api/apps/${appIdToUse}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: convexMessages, name: appName }),
    }).catch(e => logger.error('[Persist:Final] error:', e))
  }, [isLoading, app, messages])

  // ─── Auto-fix loop: subscribe to autoFixAlert and auto-send fix messages ──
  const autoFixDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAutoFixRef = useRef<{ breadcrumb: string; hidden: string } | null>(null) // Queue fix message if streaming

  useEffect(() => {
    const unsubscribe = workbenchStore.autoFixAlert.subscribe((alertData) => {
      if (!alertData) return

      // Clear the alert immediately to prevent double-fires on re-render
      workbenchStore.autoFixAlert.set(undefined)

      // Debounce: cancel any pending auto-fix send
      if (autoFixDebounceRef.current) {
        clearTimeout(autoFixDebounceRef.current)
      }

      const { command, error, source, attempt, maxAttempts } = alertData
      const sourceLabel = source === 'preview' ? 'Preview' : 'Terminal'
      const errorSnippet = error.length > 2000 ? error.slice(-2000) : error

      logger.info(`[AutoFix] ${sourceLabel} error — attempt ${attempt}/${maxAttempts}`)
      // S2: silent build — the hidden injection + (stripMetadata-nulled)
      // breadcrumb already produce no visible chat. Gate only the toast.
      if (!silentBuildActiveRef.current) {
        toast.info(`Auto-fixing ${sourceLabel.toLowerCase()} error (${attempt}/${maxAttempts})...`, {
          autoClose: 3000,
          toastId: 'auto-fix-progress',
        })
      }

      // ─── HIDDEN AUTO-FIX INJECTION (no internals leak) ──────────────────────
      // User sees ONLY a clean bilingual status breadcrumb. The real error
      // context + fix directive rides on `pipelineInstructionsRef` → the server
      // appends it to the LLM-bound user message (chat/route.ts L178-192) and
      // it NEVER renders in the chat UI. No raw `<boltAction>` XML, no terminal
      // dump, no "just output the boltArtifact" wording (that caused the model
      // to emit raw XML as visible text). The model uses its standard bolt
      // action protocol (already taught by the system prompt) so the streaming
      // parser consumes artifacts/actions normally.
      const visibleBreadcrumb = source === 'preview'
        ? `MAYA is fixing a preview error (attempt ${attempt}/${maxAttempts})…`
        : `MAYA is fixing a ${sourceLabel.toLowerCase()} error (attempt ${attempt}/${maxAttempts})…`

      const hiddenAutoFixInstruction = [
        `[Model: ${model}]`,
        `[Provider: ${provider.name}]`,
        '',
        source === 'preview'
          ? `A preview runtime error occurred (attempt ${attempt}/${maxAttempts}). Error detail:\n\n\`\`\`\n${errorSnippet}\n\`\`\``
          : `The command \`${command}\` failed (attempt ${attempt}/${maxAttempts}). Terminal output:\n\n\`\`\`sh\n${errorSnippet}\n\`\`\``,
        '',
        'Fix ONLY the broken source files causing this error. Re-emit only the corrected files in bolt action file tags.',
        'Do NOT re-run npm install, npm run build, tests, or npm run dev — the dev server is already running and will hot-reload your fix automatically.',
        'Do not explain — emit only the corrected source files directly.',
      ].join('\n')


      // Delay to let current action finish processing — use nanostore to avoid stale closure
      autoFixDebounceRef.current = setTimeout(() => {
        // Check streaming state via nanostore (not stale React state)
        if (streamingState.get()) {
          // Don't silently drop — queue it for when streaming ends
          logger.warn('[AutoFix] Queuing — still streaming, will send when done')
          pendingAutoFixRef.current = { breadcrumb: visibleBreadcrumb, hidden: hiddenAutoFixInstruction }
          return
        }
        pendingAutoFixRef.current = null
        // Hide the real error context server-side; user sees only the breadcrumb.
        pipelineInstructionsRef.current = hiddenAutoFixInstruction
        trackedSendMessage({ text: visibleBreadcrumb })
        // Clear the one-shot hidden suffix on the next tick so a later
        // user-typed message does not accidentally carry the auto-fix context.
        setTimeout(() => { pipelineInstructionsRef.current = '' }, 0)
      }, 800)
    })

    return () => {
      unsubscribe()
      if (autoFixDebounceRef.current) {
        clearTimeout(autoFixDebounceRef.current)
      }
    }
  }, [model, provider.name, chatSendMessage])

  // ─── Flush queued auto-fix when streaming ends ───────────────────────────
  useEffect(() => {
    if (!isLoading && !fakeLoading && pendingAutoFixRef.current) {
      const msg = pendingAutoFixRef.current
      pendingAutoFixRef.current = null
      logger.info('[AutoFix] Flushing queued auto-fix message after streaming ended')
      // Small delay to let post-streaming processing settle
      setTimeout(() => {
        if (!streamingState.get()) {
          // Hidden injection: breadcrumb visible, real error context server-side.
          pipelineInstructionsRef.current = msg.hidden
          trackedSendMessage({ text: msg.breadcrumb })
          setTimeout(() => { pipelineInstructionsRef.current = '' }, 0)
        }
      }, 500)
    }
  }, [isLoading, fakeLoading, chatSendMessage])

  // ─── Preview health check: if dev server started but no preview in 30s ─────
  const previewHealthRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Only run when streaming just ended — UNLESS the silent autonomous loop
    // is active (Bug 2026-07-11 install-exit-1 deadlock fix). During silent
    // build, NIM streaming rounds churn (build → verify-fail → fix-reemit
    // → re-stream → ...) — each round clears the timer, so the 90s deadline
    // never survives. With silentBuildActive, keep the timer armed across
    // streaming rounds; the timer callback already checks previews.length>0
    // → returns harmlessly if the preview landed.
    if (isLoading || fakeLoading) {
      if (!silentBuildActiveRef.current) {
        // Normal chat: clear timer, bail — diagnose only after stream ends.
        if (previewHealthRef.current) {
          clearTimeout(previewHealthRef.current)
          previewHealthRef.current = null
        }
        return
      }
      // Silent build: don't clear, don't bail — fall through so the timer
      // (re)arms below if not already set.
    }

    // Check if there are any start actions that were executed
    const allArtifacts = workbenchStore.artifacts.get()
    let hasStartAction = false

    for (const artifact of Object.values(allArtifacts)) {
      if (!artifact?.runner) continue
      const actions = artifact.runner.actions.get()
      for (const action of Object.values(actions)) {
        if ((action.type === 'start') && action.executed) {
          hasStartAction = true
        }
      }
    }

    if (!hasStartAction) return

    // Check if preview already exists
    const previews = workbenchStore.previews.get()
    if (previews.length > 0) return

    // Start 30s timeout — if no preview appears, auto-send diagnostic
    if (autoRunAttemptsRef.current >= MAX_AUTO_RUN_CYCLES) {
      logger.warn('[PreviewHealth] Max auto-run cycles reached, surfacing give-up')
      // S2: during silent build, the BuildErrorCard surface is gated off in
      // S3 (AssistantMessage) — but a give-up here must still surface. Flip the
      // single progress card to its exhausted variant (Retry/Continue), no toast.
      if (silentBuildActiveRef.current) {
        workbenchStore.silentPhase.set('exhausted')
        workbenchStore.silentBuildActive.set(false)
        silentBuildActiveRef.current = false
        return
      }
      // Gap C: graceful degradation instead of a silent stall. attempt=0/
      // maxAttempts=0 → BuildErrorCard renders its "Auto-fix unable to resolve"
      // fallback (BuildErrorCard.tsx L97-107), per CLAUDE.md "never 502 the
      // user; fallback labeled". Idempotent atom set — re-fires on effect
      // re-runs are harmless (same content; only renders on last assistant msg).
      workbenchStore.buildErrorCard.set({
        command: '(preview-health)',
        error: `No preview after ${MAX_AUTO_RUN_CYCLES} auto-run cycles. The dev server may be crashing silently — use the retry button or inspect the terminal.`,
        source: 'preview',
        attempt: 0,
        maxAttempts: 0,
      })
      return
    }

    // Cold-start grace: a fresh build runs `npm install` (~30-40s) →
    // `npm run dev` (vite ~8s) → iframe first-paint (~5s) ≈ 45s BEFORE the
    // WebContainer `server-ready` event populates `workbenchStore.previews`.
    // A flat 30s deadline fired the "preview didn't load" auto-fix DURING a
    // successful cold build (vite booted ~8s AFTER the 30s timer expired) —
    // corrupting a working build with a spurious 2nd reasoning pass + a
    // "Build error" card next to a live preview. Give the FIRST cycle 90s
    // (covers cold-install worst case + vite + paint, with margin); retries
    // stay 30s since by cycle 2 install already finished and a genuine vite
    // hang should be diagnosed fast. L863 guard still returns harmlessly if
    // the preview lands before the deadline.
    const previewHealthGraceMs = autoRunAttemptsRef.current === 0 ? 90_000 : 30_000
    if (previewHealthRef.current) return // Already armed (silent mode kept it alive)
    previewHealthRef.current = setTimeout(() => {
      const currentPreviews = workbenchStore.previews.get()
      if (currentPreviews.length > 0) return // Preview appeared, all good
      if (streamingState.get()) return // Use nanostore instead of stale closure

      autoRunAttemptsRef.current += 1
      logger.info(`[PreviewHealth] No preview after ${previewHealthGraceMs / 1000}s — auto-fixing (cycle ${autoRunAttemptsRef.current}/${MAX_AUTO_RUN_CYCLES})`)
      // S2: silent build — gate the visible toast; the hidden injection still
      // fires silently below (breadcrumb is stripMetadata-nulled → no bubble).
      if (!silentBuildActiveRef.current) {
        toast.info('No preview detected — checking for errors...', {
          autoClose: 3000,
          toastId: 'preview-health',
        })
      }

      // ─── Phase B / Phase L: hidden injection (no internals leak) ─────────────
      // Previously this sent a raw `diagMsg` user message containing literal
      // `<boltAction>` XML + "Do NOT explain. Just output the boltArtifact"
      // — exactly the wording that made the model emit raw XML as visible text
      // (leak #2). Now: user sees a clean bilingual in-chat <BuildErrorCard>
      // (via workbenchStore.buildErrorCard) + a clean status breadcrumb; the
      // real diagnostic context rides on pipelineInstructionsRef → server
      // appends it to the LLM-bound user message (chat/route.ts L178-192) and
      // it NEVER renders in the chat UI. The model uses its standard bolt
      // action protocol (already taught by the system prompt) so the streaming
      // parser consumes artifacts/actions normally.
      const visibleBreadcrumb = `MAYA is fixing a preview that didn't load (attempt ${autoRunAttemptsRef.current}/${MAX_AUTO_RUN_CYCLES})…`

      const hiddenDiagnosticInstruction = [
        `[Model: ${model}]`,
        `[Provider: ${provider.name}]`,
        '',
        `The dev server was started but no preview appeared after ${previewHealthGraceMs / 1000} seconds (auto-diagnostic attempt ${autoRunAttemptsRef.current}/${MAX_AUTO_RUN_CYCLES}). This usually means a compilation error or the dev server crashed silently.`,
        '',
        'Inspect the code for import errors (missing modules, wrong paths), syntax errors, missing dependencies in package.json. Fix ONLY the broken source files — do NOT regenerate files that already pass.',
        'Re-emit only the file(s) that need changes. Do NOT re-run npm install, npm run build, tests, or npm run dev — the dev server is already running and will hot-reload your fix automatically.',
        'Do not explain — emit only the corrected source files directly.',
      ].join('\n')

      // Surface the styled in-chat error card (Phase B). source='preview'
      // so the card labels it "preview" not "terminal".
      // S2: during silent build, skip the BuildErrorCard surface — the single
      // progress card is the only live surface (S3 also gates it). The hidden
      // injection below keeps the silent loop moving regardless.
      if (!silentBuildActiveRef.current) {
        workbenchStore.buildErrorCard.set({
          command: '(preview-health)',
          error: `Dev server started but no preview appeared after ${previewHealthGraceMs / 1000}s. Running auto-diagnostics…`,
          source: 'preview',
          attempt: autoRunAttemptsRef.current,
          maxAttempts: MAX_AUTO_RUN_CYCLES,
        })
      }

      if (streamingState.get()) {
        // Queue for when the current stream ends (same pattern as auto-fix loop).
        pendingAutoFixRef.current = { breadcrumb: visibleBreadcrumb, hidden: hiddenDiagnosticInstruction }
      } else {
        pipelineInstructionsRef.current = hiddenDiagnosticInstruction
        trackedSendMessage({ text: visibleBreadcrumb })
        setTimeout(() => { pipelineInstructionsRef.current = '' }, 0)
      }
    }, previewHealthGraceMs)

    return () => {
      if (previewHealthRef.current) {
        clearTimeout(previewHealthRef.current)
        // Silent mode: keep the ref so the guard at L1004 sees it on
        // re-entry and skips re-arming. Effects re-run on every dep change.
        // Non-silent mode: null the ref so the next !streaming run arms
        // a fresh timer (single-shot diagnose after each stream).
        if (!silentBuildActiveRef.current) {
          previewHealthRef.current = null
        }
      }
    }
  }, [isLoading, fakeLoading, model, provider.name, chatSendMessage])

  // ─── Auto-start on reload: run npm install + dev directly (no AI needed) ───
  // When a previously-built project is reopened, files exist but the dev server isn't running.
  // This effect detects that condition and auto-starts the project via WebContainer terminal.
  // IMPORTANT: Only fires when snapshot restore's synthetic message parser hasn't already
  // kicked off install/start actions. Uses a delay to avoid racing with snapshot restore.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (autoStartedRef.current) return
    if (isLoading || fakeLoading) return  // Don't start while streaming
    if (!ready || !mounted) return

    // Only trigger for reloaded projects (have messages but no active preview)
    const hasMessages = messages.length > 0 || initialMessages.length > 0
    if (!hasMessages) return

    // If initialMessages contain boltAction shell/start tags, the snapshot restore
    // path is handling it — DON'T double-start
    const initialContent = initialMessages
      .filter(m => m.role === 'assistant')
      .map(m => extractMessageText(m))
      .join('')
    const hasSnapshotActions = initialContent.includes('boltAction type="shell"') ||
      initialContent.includes('boltAction type="start"') ||
      initialContent.includes("boltAction type='shell'") ||
      initialContent.includes("boltAction type='start'")
    if (hasSnapshotActions) {
      autoStartedRef.current = true  // Mark as handled by snapshot restore
      logger.info('[AutoStart] Snapshot restore has shell/start actions — skipping auto-start')
      return
    }

    // Check if files exist in workbench but no preview
    const files = workbenchStore.files.get()
    const fileCount = Object.keys(files).length
    if (fileCount === 0) return  // No files yet

    const previews = workbenchStore.previews.get()
    if (previews.length > 0) return  // Preview already showing

    // Another path is already booting the dev server (BuilderPageWithJob
    // Effect#2 may have fired on a detached `live` hydrate). Bail so we
    // don't spawn a second `npm install && npm run dev` against the same
    // WebContainer — flag auto-clears on `server-ready` (previews.ts).
    if (devServerBooting.get()) {
      autoStartedRef.current = true
      logger.info('[AutoStart] dev server already booting — skipping')
      return
    }

    // Check if any shell/start action is currently running or was executed
    const allArtifacts = workbenchStore.artifacts.get()
    let hasRunningAction = false
    for (const artifact of Object.values(allArtifacts)) {
      if (!artifact?.runner) continue
      const actions = artifact.runner.actions.get()
      for (const action of Object.values(actions)) {
        if ((action.type === 'shell' || action.type === 'start') && (action.status === 'running' || action.executed)) {
          hasRunningAction = true
        }
      }
    }
    if (hasRunningAction) return  // Actions already in progress

    // Detect project type from files
    const fileList = Object.entries(files)
      .filter(([_, v]) => v?.type === 'file')
      .map(([path, v]) => ({ path, content: (v as any)?.content || '' }))

    const hasPackageJson = fileList.some(f => f.path.endsWith('package.json'))
    if (!hasPackageJson) return  // Not a Node.js project

    autoStartedRef.current = true

    // Delay to let any pending message parser actions complete first
    // (e.g., replayMessages may have triggered shell actions that haven't registered yet)
    const delayTimer = setTimeout(() => {
      // Re-check: preview might have appeared from message replay
      const currentPreviews = workbenchStore.previews.get()
      if (currentPreviews.length > 0) {
        logger.info('[AutoStart] Preview appeared during delay — skipping')
        return
      }

      // Re-check: actions might have started from replay
      let actionNowRunning = false
      const currentArtifacts = workbenchStore.artifacts.get()
      for (const artifact of Object.values(currentArtifacts)) {
        if (!artifact?.runner) continue
        const actions = artifact.runner.actions.get()
        for (const action of Object.values(actions)) {
          if ((action.type === 'shell' || action.type === 'start') && (action.status === 'running' || action.executed)) {
            actionNowRunning = true
          }
        }
      }
      if (actionNowRunning) {
        logger.info('[AutoStart] Actions started during delay — skipping')
        return
      }

      // T+5s recheck: a parallel boot path (BuilderPageWithJob Effect#2 on a
      // detached `live` hydrate) may have started the dev server during the
      // delay. If so, defer — a second `npm run dev` would clobber the first
      // vite and race for the same port.
      // Deployed-preview-on-reopen (Bug 2026-07-08): if the apps row is
      // `deployed` with a vercelUrl and no local preview exists, skip the
      // local boot — Preview.tsx renders the deployed URL directly. Active
      // edits later still boot local via the action-runner's bolt shell/start.
      if (deployedRef.current.isDeployed && deployedRef.current.vercelUrl) {
        logger.info('[AutoStart] app is deployed — showing deployed preview, skipping local boot')
        autoStartedRef.current = true
        return
      }
      if (devServerBooting.get()) {
        logger.info('[AutoStart] dev server booted during delay — skipping')
        autoStartedRef.current = true
        return
      }
      devServerBooting.set(true)
      logger.info('[AutoStart] Reloaded project detected — auto-starting dev server (no AI needed)')
      toast.info('Restoring project preview...', { autoClose: 4000, toastId: 'auto-start-reload' })

      // Use the WebContainer to run install + dev directly
      import('@/lib/workbench/webcontainer').then(({ webcontainer }) => {
        webcontainer.then(async (wc) => {
          try {
            const { detectProjectCommands } = await import('@/lib/workbench/utils/projectCommands')
            const commands = await detectProjectCommands(fileList)

            const installCmd = commands.setupCommand || 'npm install --no-audit --no-fund'
            const startCmd = commands.startCommand || 'npm run dev'

            logger.info(`[AutoStart] Running: ${installCmd} && ${startCmd}`)

            // Run install
            const installProcess = await wc.spawn('sh', ['-c', installCmd])
            const installExit = await installProcess.exit
            if (installExit !== 0) {
              logger.warn(`[AutoStart] Install exited with code ${installExit} — trying dev anyway`)
            }

            // Run dev server (don't await — runs indefinitely)
            await wc.spawn('sh', ['-c', startCmd])
            logger.info('[AutoStart] Dev server started')
          } catch (e) {
            logger.error('[AutoStart] Failed to auto-start project:', e)
            // Release the boot flag on failure so a competing path / retry
            // isn't blocked forever — previews.ts only clears it on success.
            devServerBooting.set(false)
          }
        })
      })
    }, 5000)  // 5s delay to let snapshot restore + message replay finish

    return () => clearTimeout(delayTimer)
  }, [ready, mounted, isLoading, fakeLoading, messages.length, initialMessages.length])

  // ─── Auto-verification: MANDATORY E2E visual sweep after every edit ─────────
  // Fires after every model response that produces a preview.
  // No guards — always enabled, always aggressive.
  useAutoVerification({
    isLoading: isLoading || fakeLoading,
    model,
    providerName: provider.name,
    chatSendMessage: trackedSendMessage,
    enabled: true,
    maxVerifications: 1,
  })

  // ─── Per-route screenshot verification (cooperative in-iframe capture) ────
  // Captures real PNGs from the preview via postMessage round-trip,
  // sends each to the VERIFIER vision model, auto-fixes on failure.
  // Runs alongside useAutoVerification — handles the image path while
  // useAutoVerification handles the text-only fallback.
  //
  // S2: onVerifyCycle replaces the default visible chatSendMessage fix-directive
  // so a verify round never renders as a user bubble during the silent build.
  //   passed=true  → vision gate met this round (flip silentPhase, arm
  //                  visionPassedRef; the exit-gate effect decides if runtime-
  //                  clean ALSO holds before clearing silentBuildActive).
  //   passed=false → bump silentCycle (1..SILENT_MAX_CYCLES); at the cap flip the
  //                  card to exhausted (no user bubble), else route fixMsg through
  //                  the hidden pipelineInstructionsRef channel via the same
  //                  stripMetadata-nulled breadcrumb pattern auto-fix uses.
  usePreviewVerification({
    isLoading: isLoading || fakeLoading,
    model,
    providerName: provider.name,
    chatSendMessage: trackedSendMessage,
    enabled: true,
    onVerifyCycle: (_hookCycle, passed, fixMsg) => {
      if (!silentBuildActiveRef.current) return
      if (passed) {
        workbenchStore.silentPhase.set('vision-judging')
        visionPassedRef.current = true
        logger.info('[SilentBuild] Vision gate met — exit-gate effect will check runtime-clean')
        return
      }
      // passed=false: at least one route failed visual verify.
      visionPassedRef.current = false
      const nextCycle = silentCycleRef.current + 1
      if (nextCycle > SILENT_MAX_CYCLES) {
        logger.warn(`[SilentBuild] Verify give-up at ${SILENT_MAX_CYCLES} cycles — exhausted card`)
        workbenchStore.silentPhase.set('exhausted')
        workbenchStore.silentBuildActive.set(false)
        silentBuildActiveRef.current = false
        return
      }
      workbenchStore.silentCycle.set(nextCycle)
      silentCycleRef.current = nextCycle
      workbenchStore.silentPhase.set('verifying')
      if (!fixMsg) return // hook max-cycles probe w/ empty msg → nothing to inject
      // Hidden injection — reuse the auto-fix pattern: fixMsg rides
      // pipelineInstructionsRef (server-injected, never renders); the visible
      // breadcrumb is stripMetadata-nulled (UserMessage autoFixPreambleRegex
      // now covers "MAYA is verifying the preview (attempt N/M)…") → no bubble.
      const breadcrumb = `MAYA is verifying the preview (attempt ${nextCycle}/${SILENT_MAX_CYCLES})…`
      pipelineInstructionsRef.current = fixMsg
      trackedSendMessage({ text: breadcrumb })
      setTimeout(() => { pipelineInstructionsRef.current = '' }, 0)
    },
  })

  // ─── S2: exit gate — runtime-clean AND vision-passed → hand to live ────────
  // Fires the instant all five hold after a verify round: silent active, the
  // vision judge passed this round (silentPhase==='vision-judging' — set by
  // onVerifyCycle passed=true), streaming idle, a preview present, and no error
  // card pending. Strictest gate (Q1): both runtime-clean AND vision-passed must
  // hold or the loop keeps cycling. On pass: set silentExitReady, clear
  // silentBuildActive (composer unlocks via S3, normal live header/preview
  // take over), reset phase for a future build. The give-up path (15 cycles) is
  // handled in onVerifyCycle — it flips silentPhase to 'exhausted' instead.
  const _buildErrorCardVal = useStore(workbenchStore.buildErrorCard)
  const _previewsVal = useStore(workbenchStore.previews)
  // A new build/fix stream mutates files → invalidate the prior vision pass so
  // the exit gate can't fire on a stale verdict. Refreshed only by the NEXT
  // verify round's onVerifyCycle(passed=true).
  useEffect(() => {
    if (streaming && silentBuildActive) visionPassedRef.current = false
  }, [streaming, silentBuildActive])
  useEffect(() => {
    if (!silentBuildActive) return
    if (streaming) return
    if (silentPhase !== 'vision-judging') return
    if (_buildErrorCardVal) return // runtime has an error card pending clear
    if (_previewsVal.length === 0) return // no preview yet
    if (!visionPassedRef.current) return // vision judge must have passed
    logger.info('[SilentBuild] Exit gate met — runtime-clean AND vision-passed')
    workbenchStore.silentExitReady.set(true)
    workbenchStore.silentBuildActive.set(false)
    silentBuildActiveRef.current = false
    workbenchStore.silentPhase.set('building') // reset for a future build
  }, [silentBuildActive, streaming, silentPhase, _buildErrorCardVal, _previewsVal])

  // ─── S5: silent build — callbacks hosted by <SilentBuildStrip> ───────────────
  // The in-browser autonomous loop runs up to 15 cycles toward a perfect preview.
  // <SilentBuildStrip> (mounted in ChatPanel when silentBuildActive OR
  // silentPhase==='exhausted') is the lone live surface: the in-flight cycle pill
  // (Building · cycle N/15 · Verifying · Vision-judging), then the exhausted
  // Retry/Continue card at the 15-cycle give-up (Q3/Q4). These 3 callbacks wire
  // the strip:
  //   onSilentCancel   → abort + disarm (click-stop escape hatch as a button)
  //   onSilentRetry    → re-arm atoms from cycle 1 + re-send the original build
  //                      triplet via the hidden pipelineInstructionsRef channel
  //                      (visible breadcrumb strips to '' via autoFixPreambleRegex
  //                      → zero user bubbles, Q3 contract preserved)
  //   onSilentContinue → unlock composer, hand control to the user (no re-send)
  const onSilentCancel = () => {
    try { stop(); chatStore.setKey('aborted', true); workbenchStore.abortAllActions() } catch {}
    workbenchStore.silentBuildActive.set(false)
    silentBuildActiveRef.current = false
    workbenchStore.silentPhase.set('building')
    toast('Build cancelled', { type: 'info', autoClose: 2000 })
  }
  const onSilentRetry = () => {
    const p = originalBuildPromptRef.current
    const m = originalBuildModelRef.current
    const pr = originalBuildProviderRef.current
    if (!p || !m || !pr) {
      toast.error(language === 'hi' ? 'मूल प्रॉम्प्ट गायब है — रिट्राय नहीं हो सकता।' : 'Missing original prompt — cannot retry.')
      return
    }
    workbenchStore.silentBuildActive.set(true)
    silentBuildActiveRef.current = true
    workbenchStore.silentPhase.set('building')
    workbenchStore.silentCycle.set(1)
    silentCycleRef.current = 1
    visionPassedRef.current = false
    pipelineInstructionsRef.current = `\n\n[Model: ${m}]\n\n[Provider: ${pr}]\n\n${p}`
    trackedSendMessage({ text: `MAYA is continuing the build (attempt 1/${SILENT_MAX_CYCLES})…` })
    setTimeout(() => { pipelineInstructionsRef.current = '' }, 0)
  }
  const onSilentContinue = () => {
    workbenchStore.silentBuildActive.set(false)
    silentBuildActiveRef.current = false
    workbenchStore.silentPhase.set('building')
    toast(language === 'hi' ? 'कंपोज़र अनलॉक — मैन्युअल भेजने के लिए तैयार' : 'Composer unlocked — send to continue manually', { type: 'info', autoClose: 2500 })
  }

  // ─── Auto-prompt from URL (with plan shown in chat) ──────────────────────
  const promptHandledRef = useRef(false)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const prompt = urlParams.get('prompt') || searchParams?.get('prompt')
    if (!prompt || promptHandledRef.current) return
    promptHandledRef.current = true

    // Read tier selection from URL (passed by landing page)
    // FIX: Resolve the model DIRECTLY from the tier instead of using stale `model` state,
    // because setSelectedTier() triggers a re-render and the sync useEffect hasn't run yet.
    let resolvedModel = model
    let resolvedProvider = provider.name
    const tierIdxStr = urlParams.get('tierIdx') || searchParams?.get('tierIdx')
    if (tierIdxStr) {
      const idx = parseInt(tierIdxStr, 10)
      if (!isNaN(idx) && idx >= 0 && idx < mayaTiers.length) {
        setSelectedTier(idx)
        // Read model directly from the tier — don't wait for state update
        resolvedModel = mayaTiers[idx].model
        resolvedProvider = mayaTiers[idx].provider
      }
    }
    // Also check URL model/provider params (direct override)
    const urlModel = urlParams.get('model') || searchParams?.get('model')
    const urlProvider = urlParams.get('provider') || searchParams?.get('provider')
    if (urlModel) resolvedModel = urlModel
    if (urlProvider) resolvedProvider = urlProvider

    // Read name from URL (passed by landing page handleApprove)
    const nameFromUrl = urlParams.get('name') || searchParams?.get('name')
    if (nameFromUrl && app && (app.name === 'New App' || app.name === 'new' || app.name === 'New Project')) {
      setApp(prev => prev ? { ...prev, name: nameFromUrl } : null)
      description.set(nameFromUrl)
    }

    // Check for plan context from the planning-first landing page
    let planContext = ''
    let planAssistantMsg: UIMessage | null = null
    try {
      const stored = sessionStorage.getItem('maya-plan')
      if (stored) {
        const plan = JSON.parse(stored)
        sessionStorage.removeItem('maya-plan') // consume once

        // Set app name from plan (fallback if URL name wasn't set)
        if (plan.name && app && (app.name === 'New App' || app.name === 'new' || app.name === 'New Project')) {
          setApp(prev => prev ? { ...prev, name: plan.name } : null)
          description.set(plan.name)
        }

        // Build a rich markdown plan message visible to the user
        let planMd = `## ${plan.name || 'App Plan'}\n\n`
        if (plan.description) planMd += `${plan.description}\n\n`

        if (plan.features?.length) {
          planMd += `### Features\n`
          plan.features.forEach((f: string) => { planMd += `- ${f}\n` })
          planMd += `\n`
        }

        if (plan.techStack?.length) {
          planMd += `**Tech Stack:** ${plan.techStack.join(' · ')}\n\n`
        }

        if (plan.pages?.length) {
          planMd += `**Pages:** ${plan.pages.join(' · ')}\n\n`
        }

        if (plan.dataModel?.length) {
          planMd += `### Data Model\n`
          planMd += `| Entity | Fields |\n|--------|--------|\n`
          plan.dataModel.forEach((e: any) => {
            planMd += `| **${e.entity}** | ${(e.fields || []).join(', ')} |\n`
          })
          planMd += `\n`
        }

        if (plan.estimatedComplexity) {
          planMd += `**Complexity:** ${plan.estimatedComplexity}\n\n`
        }

        planMd += `---\n*Plan approved. Building now…*`

        // Build the hidden plan context for the LLM
        planContext = `\n\n--- APP PLAN (pre-approved by user) ---\nApp Name: ${plan.name || 'Untitled'}\nDescription: ${plan.description || ''}\nFeatures: ${(plan.features || []).join('; ')}\nTech Stack: ${(plan.techStack || []).join(', ')}\nPages: ${(plan.pages || []).join(', ')}\nData Model: ${(plan.dataModel || []).map((e: any) => `${e.entity}(${(e.fields || []).join(', ')})`).join('; ')}\nComplexity: ${plan.estimatedComplexity || 'moderate'}\n--- END PLAN ---\n\nIMPORTANT: Build the app according to this plan. The user has already approved this architecture.`

        // Store the plan assistant message to inject AFTER the user message
        planAssistantMsg = {
          id: `plan-${Date.now()}`,
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: planMd }],
        }
      }
    } catch { /* ignore sessionStorage errors */ }

    // 1. Plan injection is DEFERRED to the send-timeout below so the user
    //    prompt lands as msg[0] and the plan as msg[1] — never plan-then-prompt
    //    (the original lander-order bug).

    // 2. Set chatId early so storeMessageHistory writes to the correct IDB key
    const resolvedChatId = appIdRef.current || chatIdAtom.get() || `maya_${Date.now()}`
    chatIdAtom.set(resolvedChatId)
    appIdRef.current = resolvedChatId

    // 3. PRE-SAVE: Create app in DB immediately — before even sending the first message
    // This ensures the app appears on the dashboard even if the user closes the tab
    if (!hasSavedRef.current) {
      hasSavedRef.current = true
      const earlyName = (new URLSearchParams(window.location.search).get('name')) ||
        prompt.replace(/\[Model:.*?\]\s*/g, '').replace(/\[Provider:.*?\]\s*/g, '').slice(0, 35).trim() || 'New App'
      const earlyCategory = app?.category || 'other'

      logger.info(`[Persist:PreSave] Saving app "${earlyName}" (${resolvedChatId}) before streaming`)
      setApp(prev => prev ? { ...prev, id: resolvedChatId, name: earlyName } : null)
      description.set(earlyName)

      fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: resolvedChatId,
          name: earlyName,
          category: earlyCategory,
          status: 'building',
          messages: [],
        }),
      }).catch(e => logger.error('[Persist:PreSave] error:', e))

      // Update URL so refreshing resumes the right session
      if (window.location.pathname === '/workbench' || !window.location.pathname.includes(resolvedChatId)) {
        window.history.replaceState({}, '', `/workbench/${resolvedChatId}`)
      }
    }

    // 4. chatSendMessage will create the user message AND trigger the API call
    // Use resolvedModel/resolvedProvider (from URL tier) instead of stale state
    const pipelineInst = `\n\n--- MANDATORY DEV LOOP (run in exact order, never skip a step) ---\nAfter writing ALL source files, execute this EXACT sequence in boltAction shell/start tags:\n1. \`<boltAction type=\"shell\">npm install</boltAction>\`\n2. \`<boltAction type=\"start\">npm run dev</boltAction>\`\n\nYou MUST NOT stop or explain anything until the dev server has started and all pages render correctly. Do NOT run \`npm run build\` or any test runner (vitest, jest) — the Vite dev server compiles TypeScript on the fly without type-checking, so a production build is unnecessary for the preview and risks a fatal re-build loop on every reload.`
    const apiUserText = `[Model: ${resolvedModel}]\n\n[Provider: ${resolvedProvider}]\n\n${prompt}${planContext}${pipelineInst}`

    //
    // PIPELINE-LEAK FIX (handout §2.2 — partially reverted disk state):
    // The user-visible chat bubble must ONLY contain `${prompt}`. Model tag,
    // plan-context block, and the MANDATORY BUILD PIPELINE block all ride on
    // `pipelineInstructionsRef` and the server's chat route appends them to
    // the LLM-bound message after stripping them from the chat UI append path.
    // We compute `visibleText` here as the bare prompt and pass it to
    // `trackedSendMessage`; the full augmented text (`apiUserText`) is kept
    // ONLY in `retryRef.current.lastUserMsg` so retries stay byte-identical.
    const visibleText = `${prompt}`
    const hiddenSuffix =
      `[Model: ${resolvedModel}]\n\n[Provider: ${resolvedProvider}]\n\n` +
      `${planContext || ''}${pipelineInst}`.replace(/\n{3,}/g, '\n\n')

    // Track for auto-retry — uses augmented text so retries reproduce the same
    // request payload (model tag + plan + pipeline ride here, NOT the chat).
    retryRef.current.lastUserMsg = apiUserText
    retryRef.current.count = 0

    // Hand hidden suffix to the server via the transport body resolver — server
    // appends the suffix to the last user message in chat/route.ts L175-L192.
    pipelineInstructionsRef.current = hiddenSuffix

    // Lander-order priming — deferred so we never duplicate the user message.
    //   trackedSendMessage appends the user message AND kicks off streaming.
    //   Pre-seeding [user, plan] in the SAME tick caused a duplicate user
    //   bubble (trackedSendMessage's append rendered next to the synth user).
    //   The watched-effect below waits for useChat to commit the user msg,
    //   then injects the plan once after it — preserving the exact order
    //   [user, plan, build].
    if (planAssistantMsg) {
      pendingPlanInjectRef.current = planAssistantMsg
      // Mark primed so the synthetic-priming effect (Effect 2 below) doesn't
      // double-seed on top.
      primedRef.current = appIdRef.current
    }
    setTimeout(() => {
      trackedSendMessage({ text: visibleText })
    }, planAssistantMsg ? 200 : 50)
  }, [searchParams])

  // ─── Progress annotations — derived from action runner states ───────────────
  const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([])

  useEffect(() => {
    if (!isLoading && !fakeLoading) {
      // Clear progress 1.5s after streaming ends so "complete" checkmarks flash
      const timer = setTimeout(() => setProgressAnnotations([]), 1500)
      return () => clearTimeout(timer)
    }

    // ── Deferred plan-inject watcher ─────────────────────────────────────
    // The URL-?prompt= effect above stashes planAssistantMsg here and then
    // kicks off trackedSendMessage. By the time useChat commits the user
    // message to its hook state this effect fires (deps on messages.length)
    // and we splice planAssistantMsg in EXACTLY once — after the user, before
    // any streamed assistant chunks. Idempotent via the .id existence check.
    if (
      pendingPlanInjectRef.current &&
      !injectedPlanIdRef.current &&
      messages.length > 0 &&
      messages[messages.length - 1]?.role === 'user'
    ) {
      const planToInject = pendingPlanInjectRef.current
      if (!messages.some((m) => m.id === planToInject.id)) {
        injectedPlanIdRef.current = planToInject.id
        setMessages((prev) => {
          const lastUserIdx = prev.map((m) => m.role).lastIndexOf('user')
          if (lastUserIdx < 0) return prev
          return [
            ...prev.slice(0, lastUserIdx + 1),
            planToInject,
            ...prev.slice(lastUserIdx + 1),
          ]
        })
      } else {
        // Already present (useChat merged it) — flip the gate so we don't retry
        injectedPlanIdRef.current = planToInject.id
      }
      pendingPlanInjectRef.current = null
    }

    // Poll action runner states while streaming (action status changes don't
    // bubble through nanostores artifacts map, so we poll at 400ms)
    const derive = () => {
      const allArtifacts = workbenchStore.artifacts.get()
      const annotations: ProgressAnnotation[] = []
      let order = 0

      for (const artifact of Object.values(allArtifacts)) {
        if (!artifact?.runner) continue

        const actions = artifact.runner.actions.get()
        for (const action of Object.values(actions)) {
          const status: 'in-progress' | 'complete' =
            action.status === 'complete' ? 'complete' : 'in-progress'

          let label = ''
          let message = ''

          if (action.type === 'file') {
            const fileName = action.filePath.split('/').pop() || action.filePath
            label = `file-${action.filePath}`
            message = status === 'complete' ? `Created ${fileName}` : `Writing ${fileName}...`
          } else if (action.type === 'shell') {
            const cmd = action.content.length > 50 ? action.content.slice(0, 50) + '…' : action.content
            label = `shell-${action.content.slice(0, 30)}`
            message = status === 'complete' ? `Ran: ${cmd}` : `Running: ${cmd}`
          } else if (action.type === 'start') {
            label = 'start-app'
            message = status === 'complete' ? 'App started' : 'Starting app...'
          } else if (action.type === 'build') {
            label = 'build-app'
            message = status === 'complete' ? 'Build complete' : 'Building app...'
          } else {
            continue
          }

          annotations.push({ type: 'progress', label, status, order: order++, message })
        }
      }

      setProgressAnnotations(annotations)
    }

    // Derive immediately + poll
    derive()
    const interval = setInterval(derive, 400)
    return () => clearInterval(interval)
  }, [isLoading, fakeLoading])





  const sendMessage = async (messageInput?: string) => {
    const messageContent = messageInput || input
    if (!messageContent?.trim()) return

    // ─── Duplicate send guard: block if already streaming ──────────
    if (isLoading && !messageInput) {
      logger.warn('[sendMessage] Blocked duplicate send — already streaming')
      return
    }

    if (isLoading) {
      stop()
      chatStore.setKey('aborted', true)
      workbenchStore.abortAllActions()
      return
    }

    // First message: pre-save + template selection
    if (messages.length === 0) {
      // Pre-save the app to DB immediately
      if (!hasSavedRef.current) {
        const resolvedId = resolveAppId()
        hasSavedRef.current = true
        // S5: stash the original build triplet so an exhausted give-up Retry
        // (GenerateJobCard → onRetry) can re-arm the silent loop + re-send the
        // build identically. Set BEFORE any async/template path diverges so a
        // template fallback still has the original prompt to replay.
        originalBuildPromptRef.current = messageContent
        originalBuildModelRef.current = model
        originalBuildProviderRef.current = provider.name
        // ── Silent autonomous build (S2): arm the silent loop ──────────
        // First build send → zero bubbles/toasts/error-cards/red-dot until a
        // perfect preview (runtime-clean AND vision-passed) or 15-cycle give-up.
        // Set atom (render/progress-card) + ref (closure reads) together.
        workbenchStore.silentBuildActive.set(true)
        workbenchStore.silentPhase.set('building')
        workbenchStore.silentCycle.set(1)
        silentBuildActiveRef.current = true
        silentCycleRef.current = 1
        visionPassedRef.current = false
        const earlyName = messageContent.slice(0, 35).trim() || 'New App'
        logger.info(`[Persist:PreSave:Manual] Saving app "${earlyName}" (${resolvedId})`)
        setApp(prev => prev ? { ...prev, id: resolvedId, name: earlyName } : null)
        description.set(earlyName)
        fetch('/api/apps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: resolvedId, name: earlyName, category: app?.category || 'other', status: 'building', messages: [] }),
        }).catch(e => logger.error('[Persist:PreSave:Manual] error:', e))
        if (window.location.pathname === '/workbench' || !window.location.pathname.includes(resolvedId)) {
          window.history.replaceState({}, '', `/workbench/${resolvedId}`)
        }
        // ── Detached agentic loop (composer-initiated build) ─────────────
        // Fire a Convex generateJob so the build survives a browser close +
        // runs the stall-retry watchdog server-side. The in-browser stream
        // (trackedSendMessage below) drives the visible vercel prose + the
        // GenerateJobCard; the detached job is the survival/build backup.
        // Composer nav strips ?prompt= above, so BuilderPageWithJob's
        // Effect#1 (gated on that query) won't double-fire this appId.
        createJob({
          appId: resolvedId,
          prompt: messageContent,
          model,
          provider: provider.name,
        }).catch((e: any) => {
          logger.error('[createJob] detached generation failed:', e)
          // S2: silent during autonomous build — never surface a toast.
          if (!silentBuildActiveRef.current) {
            toast.warn('Detached build job failed to start — in-browser gen still running.')
          }
        })
      }
      setFakeLoading(true)
      if (autoSelectTemplate) {
        const { template, title } = await selectStarterTemplate({ message: messageContent, model, provider })
        if (template !== 'blank') {
          const temResp = await getTemplates(template, title).catch(() => null)
          if (temResp) {
            const { assistantMessage, userMessage } = temResp
            const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`
            setMessages([
              { id: `1-${Date.now()}`, role: 'user', parts: [{ type: 'text' as const, text: userMessageText }] },
              { id: `2-${Date.now()}`, role: 'assistant', parts: [{ type: 'text' as const, text: assistantMessage }] },
            ])
            // Send the follow-up user message via chatSendMessage
            const followUp = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}`
            setTimeout(() => trackedSendMessage({ text: followUp }), 100)
            setInput('')
            Cookies.remove(PROMPT_COOKIE_KEY)
            resetEnhancer()
            setFakeLoading(false)
            return
          }
        }
      }
      // No template, send as normal first message
      const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`
      trackedSendMessage({ text: userMessageText })
      setFakeLoading(false)
      setInput('')
      Cookies.remove(PROMPT_COOKIE_KEY)
      resetEnhancer()
      return
    }

    // Subsequent messages
    if (error != null) setMessages(messages.slice(0, -1))

    chatStore.setKey('aborted', false)
    const modifiedFiles = workbenchStore.getModifiedFiles()
    const messageText = modifiedFiles !== undefined
      ? `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${filesToArtifacts(modifiedFiles, `${Date.now()}`)}${messageContent}`
      : `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`

    trackedSendMessage({ text: messageText })

    if (modifiedFiles !== undefined) workbenchStore.resetAllFileModifications()
    setInput('')
    Cookies.remove(PROMPT_COOKIE_KEY)
    resetEnhancer()
  }

  const debouncedCachePrompt = useCallback(
    debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
      Cookies.set(PROMPT_COOKIE_KEY, event.target.value.trim(), { expires: 30 })
    }, 1000), []
  )

  // ─── API keys from cookies ──────────────────────────────────────────────────
  useEffect(() => {
    const stored = Cookies.get('apiKeys')
    if (stored) { try { setApiKeys(JSON.parse(stored)) } catch { /* */ } }
  }, [])

  // ─── Fetch live MAYA model tiers from /api/maya-models (reads .env) ─────────
  useEffect(() => {
    fetch('/api/maya-models')
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return
        const providerMap: Record<string, string> = {
          'nvidia-nim': 'NvidiaNIM', 'anthropic': 'Anthropic',
          'openai': 'OpenAI', 'google': 'Google', 'groq': 'Groq',
        }
        const mapProv = (p: string) => providerMap[p.toLowerCase()] ?? p
        setMayaTiers([
          { label: 'Maya Mini',     model: data.mini.model, provider: mapProv(data.mini.provider), description: 'Fast & light',  inputPrice: '$0.25', outputPrice: '$1.25' },
          { label: 'Maya Balanced', model: data.fast.model, provider: mapProv(data.fast.provider), description: 'Balanced',      inputPrice: '$0.50', outputPrice: '$2.00' },
          { label: 'Maya Max',      model: data.max.model,  provider: mapProv(data.max.provider),  description: 'Most capable',  inputPrice: '$1.00', outputPrice: '$4.00' },
        ])
      })
      .catch(() => { /* keep DEFAULT_MAYA_TIERS on network error */ })
  }, [])

  // NOTE: Duplicate tier sync useEffect removed — the one at lines 183-192 handles this

  // ─── Initialize workbench ───────────────────────────────────────────────────
  useEffect(() => {
    workbenchStore.showWorkbench.set(true)
    chatStore.setKey('started', true)
  }, [])

  // ─── App-level state ────────────────────────────────────────────────────────
  const dropupRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) setShowProjectMenu(false)
      if (tierMenuRef.current && !tierMenuRef.current.contains(e.target as Node) &&
          dropupRef.current && !dropupRef.current.contains(e.target as Node)) setShowTierMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  useEffect(() => {
    setMounted(true)

    // CRITICAL: Set chatIdAtom to appId BEFORE any persistence happens.
    // This ensures IndexedDB stores messages under the same key as the URL.
    // Without this, useChatHistory auto-generates a different numeric ID and messages are lost on reload.
    if (appId && appId !== 'new') {
      chatIdAtom.set(appId)
    }

    if (appId) { fetchApp() } else { setLoading(false); setApp({ id: 'new', name: 'New App', category: 'other', url: '', projectId: '', createdAt: new Date().toISOString(), status: 'building', version: 1 }) }
  }, [appId])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchApp = async () => {
    if (!appId) return
    try {
      const r = await fetch(`/api/apps/${appId}`)
      if (!r.ok) {
        console.warn(`[fetchApp] /api/apps/${appId} returned ${r.status}`)
        setApp({ id: appId, name: 'New App', category: 'other', url: '', projectId: '', createdAt: new Date().toISOString(), status: 'building', version: 1 })
        setLoading(false)
        return
      }
      const { app: f } = await r.json()
      if (f) {
        setApp({ id: f.id, name: f.name, nameHindi: f.nameHindi, descriptionEn: f.descriptionEn, category: f.category, url: f.url || '', projectId: f.projectId || '', createdAt: f.createdAt || new Date().toISOString(), status: f.status || 'live', version: f.version || 1, specJson: f.specJson || null })

        // SYNC: Mark this app as already saved so persistence effect does UPDATE not CREATE
        appIdRef.current = f.id || appId
        hasSavedRef.current = true

        // Load messages from Convex when IndexedDB has nothing
        if (f.messages && Array.isArray(f.messages) && f.messages.length > 0 && messages.length === 0) {
          const uiMessages: UIMessage[] = f.messages.map((m: { role: string; content: string; timestamp: number }, idx: number) => ({
            id: `convex-${idx}-${m.timestamp || Date.now()}`,
            role: m.role as 'user' | 'assistant',
            parts: [{ type: 'text' as const, text: m.content }],
          }))
          setMessages(uiMessages)
          logger.info(`Loaded ${uiMessages.length} messages from Convex for app ${appId}`)

          // Replay assistant messages through the streaming parser to reconstruct
          // artifacts and file actions in the WebContainer for preview restoration
          setTimeout(() => replayMessages(uiMessages), 100)
        }
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // ── Synthetic chat priming ──────────────────────────────────────────────────
  // Runs ONCE per appId when the chat thread starts empty but we still have a
  // stored plan (apps.specJson) or an incoming ?prompt=. Ensures the user's
  // original prompt appears as the first chat message and the plan as the next
  // assistant message — never again the assistant plan rendering above the
  // user's still-pending prompt.
  const primedRef = useRef<string | null>(null)
  // URL-?prompt= plan-inject coordination (see the deferred-inject effect
  // above and the Effect 1 in the auto-prompt path).
  const pendingPlanInjectRef = useRef<UIMessage | null>(null)
  const injectedPlanIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!app || !appIdRef.current) return
    if (primedRef.current === appIdRef.current) return
    // The URL-?prompt= streaming path is owned by the auto-prompt effect
    // (~line 904, which sets promptHandledRef synchronously). Bail here to
    // avoid double-seeding a synthetic [user, plan] on top of that path,
    // which would duplicate the user bubble and stack two plan messages.
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('prompt')) {
      primedRef.current = appIdRef.current
      return
    }
    if (messages.length > 0) {
      primedRef.current = appIdRef.current
      return
    }
    const spec = typeof app.specJson === 'string' && app.specJson.trim() ? (JSON.parse(app.specJson) as any) : null
    const urlPrompt = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('prompt') : null
    if (!spec && !urlPrompt) return
    try {
      const planBlock = spec
        ? '## ' + (spec.name || 'App plan') +
          '\n\n' + (spec.description || '') +
          '\n\n**Features:**\n' + ((Array.isArray(spec.features) ? spec.features : []).map(function (x: string) { return '- ' + x }).join('\n')) +
          '\n\n**Tech stack:** ' + ((Array.isArray(spec.techStack) ? spec.techStack : []).join(', '))
        : 'Generation in progress — files will appear here once the build completes.'
      const promptText = urlPrompt || (spec && spec.name) || 'Build your app'
      const synth: UIMessage[] = [
        { id: 'synth-prompt-' + Date.now(), role: 'user', parts: [{ type: 'text' as const, text: promptText }] },
        { id: 'synth-plan-' + Date.now(), role: 'assistant', parts: [{ type: 'text' as const, text: planBlock }] },
      ]
      setMessages(synth)
      primedRef.current = appIdRef.current
      logger.info(`[plan] primed ${synth.length} synthetic chat messages for ${appIdRef.current}`)
    } catch (e) {
      logger.warn('[plan] synthetic priming skipped:', (e as Error).message)
    }
  }, [app, messages.length])

  const handleRename = async () => {
    if (!renameValue.trim() || !app) return
    try { await fetch(`/api/apps/${app.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: renameValue.trim() }) }); setApp(p => p ? { ...p, name: renameValue.trim() } : null) } catch { /* */ }
    setIsRenaming(false); setShowProjectMenu(false)
  }

  const handleDelete = async () => {
    if (!app) return
    try { await fetch(`/api/apps/${app.id}`, { method: 'DELETE' }); router.push('/dashboard') } catch { /* */ }
  }

  const handleToggleTerminal = useCallback(() => { workbenchStore.toggleTerminal(!showTerminal) }, [showTerminal])

  if (!mounted || !ready) return null

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="h-[100dvh] bg-[#111110] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative w-9 h-9"><div className="absolute inset-0 border-2 border-[#E8601A]/15 rounded-full" /><div className="absolute inset-0 border-2 border-[#E8601A] rounded-full border-t-transparent animate-spin" /></div>
        <p className="text-[11px] text-[#3A3835]">{language === 'hi' ? 'लोड हो रहा है...' : 'Loading...'}</p>
      </div>
    </div>
  )

  // ── 404 ────────────────────────────────────────────────────────────────────
  if (appId && !app) return (
    <div className="h-[100dvh] bg-[#111110] flex flex-col items-center justify-center text-center px-4">
      <Search className="w-7 h-7 text-[#E8601A] mb-3" />
      <h2 className="text-base font-semibold mb-1 text-[#F5F4F0]">{language === 'hi' ? 'ऐप नहीं मिला' : 'App Not Found'}</h2>
      <p className="text-[13px] text-[#3A3835] mb-4">{language === 'hi' ? 'यह ऐप मौजूद नहीं है।' : 'This app does not exist.'}</p>
      <button onClick={() => router.push('/dashboard')} className="flex items-center gap-1 text-[#E8601A] text-[13px] font-medium cursor-pointer"><ArrowLeft className="w-3.5 h-3.5" />{language === 'hi' ? 'वापस जाएं' : 'Go back'}</button>
    </div>
  )

  // ── Derived ────────────────────────────────────────────────────────────────
  // M4: anti-AI-slop tokens — kill tailwind-default amber/emerald, use MAYA
  // orange (#E8601A) / success (#2D7A4F) / error (#F87171).
  // S2: during silent autonomous build, the header dot never shows red — the
  // only live surface is the single progress card. Force orange "Building".
  const statusDot = silentBuildActive
    ? 'bg-[#E8601A]'
    : streaming
      ? 'bg-[#E8601A]'
      : status === 'error'
        ? 'bg-[#F87171]'
        : 'bg-[#2D7A4F]'
  const statusText = silentBuildActive
    ? 'Building'
    : streaming
      ? 'Building'
      : status === 'error'
        ? 'Error'
        : 'Ready'
  const hasInput = (input || '').trim().length > 0

  // Mapped messages for rendering (parsed by engine)
  const displayMessages = messages.map((message, i) => {
    if (message.role === 'user') return message
    return { ...message, content: parsedMessages[i] || '' }
  })

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════════

  return (
    <div className="h-[100dvh] w-full max-w-[100vw] min-w-0 isolate bg-[#111110] flex flex-col overflow-hidden text-[#F5F4F0]">

      {/* ═══ TOP BAR ═══════════════════════════════════════════════════════ */}
      <header className="h-11 flex items-center justify-between px-2.5 border-b border-white/[0.06] bg-[#1A1917] shrink-0 z-30">

        {/* Left: back + project name + status */}
        <div className="flex items-center gap-1 min-w-0">
          <button onClick={() => router.push('/dashboard')} className="p-1.5 rounded-md text-[#4A4742] hover:text-[#F5F4F0] hover:bg-white/[0.05] transition-all shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="relative" ref={projectMenuRef}>
            <button onClick={() => setShowProjectMenu(!showProjectMenu)} className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/[0.04] transition-colors min-w-0 group">
              <span className="text-[13px] font-medium text-[#F5F4F0] truncate max-w-[200px]" style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}>
                {language === 'hi' && app?.nameHindi ? app.nameHindi : app?.name || 'New App'}
              </span>
              <ChevronDown className={`w-3 h-3 text-[#6B6560] group-hover:text-[#9E9890] shrink-0 transition-transform ${showProjectMenu ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showProjectMenu && (
                <motion.div initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.97 }} transition={{ duration: 0.12 }}
                  className="absolute top-full left-0 mt-1 w-48 bg-[#222120] rounded-lg ring-1 ring-white/[0.08] shadow-xl shadow-black/40 py-1 z-50">
                  {isRenaming ? (
                    <div className="px-2 py-1.5 flex items-center gap-1.5">
                      <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setIsRenaming(false); setShowProjectMenu(false) } }}
                        className="flex-1 bg-[#1A1917] rounded-md px-2 py-1 text-[12px] text-[#F5F4F0] border border-white/[0.08] outline-none focus:border-[#E8601A]/40 min-w-0" placeholder="App name..." />
                      <button onClick={handleRename} className="p-1 text-emerald-400 hover:bg-white/[0.05] rounded"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { setIsRenaming(false); setShowProjectMenu(false) }} className="p-1 text-[#4A4742] hover:bg-white/[0.05] rounded"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => { setIsRenaming(true); setRenameValue(app?.name || '') }} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#D4D0CA] hover:bg-white/[0.05] transition-colors text-left"><Pencil className="w-3.5 h-3.5 text-[#6B6560]" />{language === 'hi' ? 'नाम बदलें' : 'Rename'}</button>
                      <button onClick={() => setShowProjectMenu(false)} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-[#D4D0CA] hover:bg-white/[0.05] transition-colors text-left"><Settings className="w-3.5 h-3.5 text-[#6B6560]" />{language === 'hi' ? 'सेटिंग्स' : 'Settings'}</button>
                      <div className="h-px bg-white/[0.06] my-1" />
                      {showDeleteConfirm ? (
                        <div className="px-3 py-2 space-y-2">
                          <p className="text-[11px] text-red-400">{language === 'hi' ? 'क्या आप पक्का डिलीट करना चाहते हैं?' : 'Delete permanently?'}</p>
                          <div className="flex gap-1.5">
                            <button onClick={handleDelete} className="flex-1 px-2 py-1 text-[11px] bg-red-500/15 text-red-400 rounded-md hover:bg-red-500/25 transition-colors">{language === 'hi' ? 'हाँ' : 'Yes'}</button>
                            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-2 py-1 text-[11px] bg-white/[0.05] text-[#6B6560] rounded-md hover:bg-white/[0.08] transition-colors">{language === 'hi' ? 'रद्द' : 'Cancel'}</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setShowDeleteConfirm(true)} className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-red-400/80 hover:bg-red-500/[0.06] transition-colors text-left"><Trash2 className="w-3.5 h-3.5" />{language === 'hi' ? 'डिलीट' : 'Delete'}</button>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <div className={`w-1.5 h-1.5 rounded-full ${statusDot} ${streaming ? 'animate-pulse' : ''}`} />
            <span className="text-[10px] text-[#6B6560] uppercase tracking-wider font-medium">{statusText}</span>
          </div>
        </div>

        {/* Right: version + terminal + publish — cohesive toolbar */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Version + Terminal group */}
          <div className="flex items-center bg-white/[0.03] rounded-lg ring-1 ring-white/[0.06]">
            <button className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-[#6B6560] hover:text-[#F5F4F0] transition-colors rounded-l-lg hover:bg-white/[0.04]">
              <GitBranch className="w-3 h-3" />
              <span>v{app?.version || 1}</span>
            </button>

            <div className="w-px h-4 bg-white/[0.06]" />

            <button onClick={handleToggleTerminal} className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium transition-all rounded-r-lg ${showTerminal ? 'bg-[#E8601A]/10 text-[#E8601A]' : 'text-[#6B6560] hover:text-[#F5F4F0] hover:bg-white/[0.04]'}`}>
              <TerminalIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="hidden sm:inline">Terminal</span>
            </button>
          </div>

          {/* GitHub snapshot button */}
          <GitHubSnapshotButton />

          {/* Deploy button (bolt.diy) */}
          <DeployButton />
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isMobile ? (
          /* ── MOBILE ────────────────────────────────────────────────── */
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0 overflow-hidden">
              {mobileTab === 'chat' ? (
                <ChatPanel
                  messages={displayMessages} setMessages={setMessages} isStreaming={isLoading || fakeLoading}
                  status={status}
                  input={input} handleInputChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { handleInputChange(e); debouncedCachePrompt(e) }}
                  sendMessage={sendMessage} handleStop={() => { stop(); chatStore.setKey('aborted', true); workbenchStore.abortAllActions() }}
                  actionAlert={actionAlert} clearAlert={() => workbenchStore.clearAlert()}
                  progressAnnotations={progressAnnotations}
                  append={append} regenerate={regenerate} addToolResult={addToolResultLegacy}
                  model={model} provider={provider}
                  language={language}
                  silentBuildActive={silentBuildActive}
                  silentPhase={silentPhase}
                  onSilentCancel={onSilentCancel}
                  onSilentRetry={onSilentRetry}
                  onSilentContinue={onSilentContinue}
                  mayaTiers={mayaTiers}
                  selectedTier={selectedTier} setSelectedTier={setSelectedTier}
                  showTierMenu={showTierMenu} setShowTierMenu={setShowTierMenu}
                  tierMenuRef={tierMenuRef} activeTier={activeTier}
                  setModel={setModel} setProvider={setProvider}
                  dropupRef={dropupRef} setInput={setInput}
                  enhancingPrompt={enhancingPrompt} promptEnhanced={promptEnhanced} enhancePrompt={enhancePrompt}
                />
              ) : (
                <WorkbenchPreview viewport={viewport} />
              )}
            </div>
            <div className="flex bg-[#1A1917] border-t border-white/[0.06] shrink-0">
              <button onClick={() => setMobileTab('chat')} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${mobileTab === 'chat' ? 'text-[#E8601A]' : 'text-[#6B6560]'}`}><MessageSquare className="w-4 h-4" /><span className="text-[9px] font-medium">{language === 'hi' ? 'चैट' : 'Chat'}</span></button>
              <button onClick={() => setMobileTab('preview')} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${mobileTab === 'preview' ? 'text-[#E8601A]' : 'text-[#6B6560]'}`}><Eye className="w-4 h-4" /><span className="text-[9px] font-medium">{language === 'hi' ? 'प्रीव्यू' : 'Preview'}</span></button>
            </div>
          </div>
        ) : (
          /* ── DESKTOP ───────────────────────────────────────────────── */
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={25} minSize={18} maxSize={40}>
              <ChatPanel
                messages={displayMessages} setMessages={setMessages} isStreaming={isLoading || fakeLoading}
                status={status}
                input={input} handleInputChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => { handleInputChange(e); debouncedCachePrompt(e) }}
                sendMessage={sendMessage} handleStop={() => { stop(); chatStore.setKey('aborted', true); workbenchStore.abortAllActions() }}
                actionAlert={actionAlert} clearAlert={() => workbenchStore.clearAlert()}
                progressAnnotations={progressAnnotations}
                append={append} regenerate={regenerate} addToolResult={addToolResultLegacy}
                model={model} provider={provider}
                language={language}
                silentBuildActive={silentBuildActive}
                silentPhase={silentPhase}
                onSilentCancel={onSilentCancel}
                onSilentRetry={onSilentRetry}
                onSilentContinue={onSilentContinue}
                mayaTiers={mayaTiers}
                selectedTier={selectedTier} setSelectedTier={setSelectedTier}
                showTierMenu={showTierMenu} setShowTierMenu={setShowTierMenu}
                tierMenuRef={tierMenuRef} activeTier={activeTier}
                setModel={setModel} setProvider={setProvider}
                dropupRef={dropupRef} setInput={setInput}
                enhancingPrompt={enhancingPrompt} promptEnhanced={promptEnhanced} enhancePrompt={enhancePrompt}
              />
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={75} minSize={60}>
              <PanelGroup direction="vertical" className="h-full">
                <Panel defaultSize={showTerminal ? 70 : 100} minSize={30}>
                  <WorkbenchPreview viewport={viewport} viewportSetter={setViewport} />
                </Panel>
                <PanelResizeHandle className="relative flex h-px items-center justify-center cursor-row-resize bg-white/[0.04] hover:bg-[#E8601A]/20 active:bg-[#E8601A]/30 transition-colors duration-150" />
                <TerminalTabs />
              </PanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// ChatPanel — Builder-styled chat using bolt.diy Messages for LLM rendering
// With: mic default, send on input, model selector in input area, taller box
// ═════════════════════════════════════════════════════════════════════════════

interface ChatPanelProps {
  messages: UIMessage[]
  setMessages?: (messages: UIMessage[]) => void
  isStreaming: boolean
  /** vercel ChatStatus — drives 4-state SendButton (M4). Falls back to isStreaming. */
  status?: 'ready' | 'submitted' | 'streaming' | 'error'
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  sendMessage: (messageInput?: string) => void
  handleStop: () => void
  actionAlert: any
  clearAlert: () => void
  progressAnnotations: ProgressAnnotation[]
  append: (message: any) => void
  regenerate: () => void
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void
  model: string
  provider: ProviderInfo
  language: 'hi' | 'en'
  // Model tier
  mayaTiers: MayaTier[]
  selectedTier: number
  setSelectedTier: (tier: number) => void
  showTierMenu: boolean
  setShowTierMenu: (show: boolean) => void
  tierMenuRef: React.RefObject<HTMLDivElement | null>
  activeTier: MayaTier
  setModel: (m: string) => void
  setProvider: (p: ProviderInfo) => void
  dropupRef: React.RefObject<HTMLDivElement | null>
  setInput: (v: string) => void
  // Prompt enhancement
  enhancingPrompt: boolean
  promptEnhanced: boolean
  enhancePrompt: (input: string, setInput: (v: string) => void, model: string, provider: ProviderInfo, apiKeys?: Record<string, string>) => void
  // S2: silent autonomous build — true while the silent build loop is armed.
  // Locks the composer (disabled textarea + Building… hint) and forces the
  // SendButton to its stop affordance — the escape hatch (click stop aborts the
  // loop). Until a perfect preview or 15-cycle give-up, no new user send is
  // accepted; the only live interaction is click-stop-to-abort.
  silentBuildActive: boolean
  // S5: silent-build phase atom read for <SilentBuildStrip> ('building' |
  // 'verifying' | 'vision-judging' | 'exhausted'). Strip mounts when
  // silentBuildActive OR silentPhase==='exhausted' (the give-up Retry/Continue
  // surface stays visible after the exhaustion setters clear silentBuildActive).
  silentPhase: 'building' | 'verifying' | 'vision-judging' | 'exhausted'
  onSilentCancel?: () => void
  onSilentRetry?: () => void
  onSilentContinue?: () => void
}


const ChatPanel = memo((
  {
    messages, setMessages, isStreaming, status, input, handleInputChange, sendMessage, handleStop,
    actionAlert, clearAlert, progressAnnotations, append, regenerate, addToolResult,
    model, provider, language,
    mayaTiers, selectedTier, setSelectedTier, showTierMenu, setShowTierMenu,
    tierMenuRef, activeTier, setModel, setProvider,
    dropupRef, setInput,
    enhancingPrompt, promptEnhanced, enhancePrompt,
    silentBuildActive,
    silentPhase, onSilentCancel, onSilentRetry, onSilentContinue,
  }: ChatPanelProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const tierBtnRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dropupPos, setDropupPos] = useState<{ left: number; bottom: number } | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const hasInput = (input || '').trim().length > 0

  // M4: derive vercel 4-state from useChat `status` (ready/submitted/streaming/
  // error), falling back to the legacy isStreaming boolean (which already folds
  // in fakeLoading from the call sites). Drives the inline SendButton. ready →
  // send; submitted/streaming/error → stop (avoids double-send on submitted).
  // S2: while the silent build is armed, force the stop affordance (the escape
  // hatch) even between verify rounds when streaming is idle — the composer is
  // locked, so click=abort, never send. Closes the "ready → accidental resend"
  // gap during the silent pause between fix streams.
  const sendStatus: 'ready' | 'submitted' | 'streaming' | 'error' =
    silentBuildActive ? 'streaming'
    : status === 'error' ? 'error'
    : status === 'streaming' || status === 'submitted' ? status
    : isStreaming ? 'streaming'
    : 'ready'

  // M4: anti-AI-slop baseline for toolbar icon buttons. Square 32×32 (kills the
  // 28×36 ellipse + phosphor `block` line-height stretch), tactile active:scale-95,
  // Maya cubic-bezier (no linear/ease-in-out), leading-none so the icon centers.
  const btnBase =
    'h-8 w-8 flex items-center justify-center rounded-lg leading-none shrink-0 active:scale-95 transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]'

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px` }
  }, [input])

  // Compute dropup position when opening
  useEffect(() => {
    if (showTierMenu && tierBtnRef.current) {
      const rect = tierBtnRef.current.getBoundingClientRect()
      setDropupPos({ left: rect.left, bottom: window.innerHeight - rect.top + 6 })
    } else {
      setDropupPos(null)
    }
  }, [showTierMenu])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (isStreaming) { handleStop(); return }
      if (e.nativeEvent.isComposing) return
      sendMessage()
    }
  }

  // ── Microphone: Groq Whisper via /api/transcribe ──
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (blob.size < 1000) { toast.warning('Recording too short'); return }
        setIsTranscribing(true)
        try {
          const formData = new FormData()
          formData.append('audio', blob, 'voice.webm')
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData })
          const data = await res.json()
          if (data.native) {
            const current = input || ''
            setInput(current ? `${current} ${data.native}` : data.native)
          } else if (data.error) {
            toast.error(data.error)
          }
        } catch (err) {
          toast.error('Transcription failed')
          console.error(err)
        } finally {
          setIsTranscribing(false)
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch {
      toast.error(language === 'hi' ? 'माइक्रोफ़ोन एक्सेस नहीं मिला' : 'Microphone access denied')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }

  const toggleMic = () => {
    if (isRecording) { stopRecording() } else { startRecording() }
  }

  // ── File attach ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const file = files[0]
    // For images, convert to base64 and add as context
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => {
        const current = input || ''
        setInput(current ? `${current}\n[Attached: ${file.name}]` : `[Attached: ${file.name}]`)
        toast.success(`${file.name} attached`)
      }
      reader.readAsDataURL(file)
    } else {
      // For text files, read content
      const reader = new FileReader()
      reader.onload = () => {
        const content = reader.result as string
        const current = input || ''
        const fileBlock = `\`\`\`${file.name}\n${content.slice(0, 5000)}\n\`\`\``
        setInput(current ? `${current}\n${fileBlock}` : fileBlock)
        toast.success(`${file.name} attached`)
      }
      reader.readAsText(file)
    }
    e.target.value = '' // Reset
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#1A1917]">
      {/* ── Messages area (relative wrapper so the alert/progress overlay can
          float above the scroll surface as an absolute sibling, NOT as a
          sticky child inside <StickToBottom.Content> — sticky-inside-content
          races the spring on every layout tick and yanks the viewport). ── */}
      <div className="relative flex-1 min-h-0">
      {/* S5: slim <SilentBuildStrip> mounts at the TOP of the chat column when
          the silent autonomous loop is armed (silentBuildActive) OR at the
          15-cycle give-up (silentPhase==='exhausted'). It is the ONLY live
          surface for the loop's progress: the in-flight cycle pill (Building ·
          cycle N/15 · Verifying · Vision-judging), then the exhausted
          Retry/Continue. It REPLACES the full-screen <GenerateJobCard> chat-
          column mount (Bug 2026-07-11: user must never see "Building your app"
          on the live site). The chat Messages + the preview column ALWAYS render
          below/alongside it — no full-screen blocking card. The strip reads
          silentPhase/silentCycle from workbenchStore directly; its maxCycles
          default (15) mirrors SILENT_MAX_CYCLES (outer BuilderPage L206) so the
          label stays in sync without a cross-file constant import. The
          silentPhase==='exhausted' arm of the gate keeps the strip (with its
          Retry/Continue) mounted AFTER the exhaustion setters clear
          silentBuildActive same-tick (the prior full-card exhausted variant was
          dead UI — every exhausted setter disarmed the card → unmounted). */}
      {(silentBuildActive || silentPhase === 'exhausted') && (
        <SilentBuildStrip
          language={language}
          onCancel={onSilentCancel}
          onRetry={onSilentRetry}
          onContinue={onSilentContinue}
        />
      )}
      {messages.length === 0 ? (
        /* Empty state: inline, NON-scrollable greeting. Previously the empty
           chat rendered <Greeting> as an ABSOLUTE overlay riding the
           <StickToBottom.Content modern-scrollbar> scroll surface — which read
           as a "scrollable element saying ask anything." Now the empty state
           is a plain flex-centered block with no scroll container; the scroll
           surface mounts only once there are messages to scroll. */
        <div className="flex flex-1 min-h-0 items-center justify-center px-3">
          <Greeting language={language} />
        </div>
      ) : (
      <StickToBottom
        className="h-full px-3 pt-4"
        resize="smooth"
        initial="smooth"
        mass={1.25}
        damping={0.7}
        stiffness={0.05}
      >
        <StickToBottom.Content className="flex flex-col gap-2 relative pb-4 modern-scrollbar">
          <ClientOnly>
            {() => (
              <Messages
                className="flex flex-col w-full flex-1 mx-auto z-1"
                messages={messages}
                setMessages={setMessages}
                isStreaming={isStreaming}
                append={append}
                regenerate={regenerate}
                chatMode="build"
                model={model}
                provider={provider}
                addToolResult={addToolResult}
              />
            )}
          </ClientOnly>
          <BuilderScrollToBottom />
        </StickToBottom.Content>
      </StickToBottom>
      )}

      {/* Alert/progress overlay — absolute sibling OUTSIDE <StickToBottom>.
          Was a sticky child inside Content, which raced the spring on every
          layout tick and yanked the viewport. Now floats above the scroll
          surface without touching scroll physics. px-3 matches the scroller's
          horizontal padding so alerts align with message copy. */}
      <div className="pointer-events-none absolute bottom-2 left-0 right-0 z-10 flex flex-col gap-2 items-center px-3">
        {actionAlert && (
          <div className="pointer-events-auto w-full max-w-3xl">
            <ChatAlert
              alert={actionAlert}
              clearAlert={clearAlert}
              postMessage={(message: string | undefined) => { sendMessage(message); clearAlert() }}
            />
          </div>
        )}
      </div>
      </div>

      {/* ── Hidden file input ── */}
      <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.txt,.md,.json,.csv,.tsx,.ts,.js,.jsx,.html,.css" onChange={handleFileSelect} />

      {/* ── Input bar ── */}
      <div
        className="shrink-0 bg-[#1A1917]/85 backdrop-blur-[12px]"
        style={{ maskImage: 'linear-gradient(to bottom, transparent, black 36px)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 36px)' }}
      >
        <div className="px-3 py-3">
          <div className="bg-[#222120] rounded-2xl ring-1 ring-white/[0.05] focus-within:ring-[#E8601A]/20 transition-all">
            <div className="px-4 pt-3 pb-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={onKey}
                disabled={isStreaming || silentBuildActive}
                placeholder={silentBuildActive ? (language === 'hi' ? 'MAYA बिल्ड कर रही है… पूर्ण प्रीव्यू तक लॉक' : 'MAYA is building… locked until perfect preview') : isStreaming ? (language === 'hi' ? 'MAYA काम कर रही है...' : 'MAYA is working...') : (language === 'hi' ? 'अपना ऐप आइडिया बताएं...' : 'Describe your idea, we will bring it to life..')}
                rows={2}
                className={`w-full bg-transparent border-none outline-none text-[13px] text-[#F5F4F0] placeholder:text-[#6B6560] resize-none leading-[1.6] max-h-[160px] ${isStreaming || silentBuildActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ minHeight: '52px' }}
              />
            </div>

            {/* Bottom toolbar — M4: anti-AI-slop baseline (square 32×32, MAYA tokens,
                tactile active:scale-95, cubic-bezier; kills the 28×36 ellipse defect) */}
            <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
              <div className="flex items-center gap-0.5">
                {/* Attach file button */}
                <button onClick={() => fileInputRef.current?.click()} className={`${btnBase} text-[#6B6560] hover:text-[#D4D0CA] hover:bg-white/[0.04]`} title={language === 'hi' ? 'फ़ाइल जोड़ें' : 'Attach file'}>
                  <span className="i-ph:plus w-4 h-4" />
                </button>

                {/* Enhance prompt button */}
                <button
                  onClick={() => {
                    if (input.trim() && !enhancingPrompt) {
                      enhancePrompt(input, setInput, model, provider)
                    }
                  }}
                  disabled={!input.trim() || enhancingPrompt || isStreaming}
                  className={`${btnBase} ${
                    enhancingPrompt
                      ? 'text-[#E8601A] animate-pulse'
                      : promptEnhanced
                        ? 'text-[#2D7A4F] hover:bg-white/[0.04]'
                        : 'text-[#6B6560] hover:text-[#D4D0CA] hover:bg-white/[0.04]'
                  } disabled:opacity-30 disabled:cursor-not-allowed disabled:active:scale-100`}
                  title={enhancingPrompt ? 'Enhancing...' : promptEnhanced ? 'Prompt enhanced ✓' : (language === 'hi' ? 'प्रॉम्प्ट सुधारें' : 'Enhance prompt')}
                >
                  <span className="i-ph:magic-wand w-4 h-4" />
                </button>

                {/* Model tier selector — labeled chip (not square), same tactile easing */}
                <div className="relative" ref={tierMenuRef}>
                  <button ref={tierBtnRef} onClick={() => setShowTierMenu(!showTierMenu)} className="flex items-center gap-1 px-2.5 h-8 rounded-lg text-[11px] font-medium text-[#9E9890] hover:text-[#D4D0CA] hover:bg-white/[0.04] active:scale-95 transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]">
                    <span>{activeTier.label}</span>
                    <span className={`i-ph:caret-down-bold w-2.5 h-2.5 transition-transform ${showTierMenu ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Right: mic + regenerate + send/stop */}
              <div className="flex items-center gap-0.5">
                {/* Mic button */}
                <button
                  onClick={toggleMic}
                  disabled={isTranscribing}
                  className={`${btnBase} ${
                    isRecording
                      ? 'text-[#F87171] bg-[#F87171]/10 animate-pulse'
                      : isTranscribing
                        ? 'text-[#E8601A]'
                        : hasInput
                          ? 'text-[#6B6560] hover:text-[#D4D0CA] hover:bg-white/[0.04]'
                          : 'text-[#9E9890] hover:text-[#F5F4F0] hover:bg-white/[0.04]'
                  } disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100`}
                  title={isRecording ? (language === 'hi' ? 'रुकें' : 'Stop recording') : isTranscribing ? (language === 'hi' ? 'लिख रहा है...' : 'Transcribing...') : (language === 'hi' ? 'बोलकर टाइप करें' : 'Voice input')}
                >
                  <span className="i-ph:microphone w-4 h-4" />
                </button>

                {/* M2: Regenerate — re-roll the last assistant turn. Gated: only
                    when there are messages to re-roll. Hidden while streaming so
                    the SendButton owns the stop affordance. */}
                {messages.length > 0 && !isStreaming && (
                  <button
                    onClick={regenerate}
                    className={`${btnBase} text-[#9E9890] hover:text-[#E8601A] hover:bg-[#E8601A]/[0.06]`}
                    title={language === 'hi' ? 'फिर से जवाब दें' : 'Regenerate response'}
                  >
                    <span className="i-ph:arrow-clockwise w-3.5 h-3.5" />
                  </button>
                )}

                {/* M4: 4-state SendButton (variant=inline) — ArrowUp send, Square
                    stop, Loader2 spinner, X error. Replaces the rounded-full ellipse
                    + dual stop/send block. ready → sendMessage; else → handleStop. */}
                <SendButton
                  variant="inline"
                  status={sendStatus}
                  disabled={!hasInput && sendStatus === 'ready'}
                  onClick={sendStatus === 'ready' ? () => sendMessage() : handleStop}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Model dropup (fixed position — escapes overflow-hidden) ── */}
      <AnimatePresence>
        {showTierMenu && dropupPos && (
          <motion.div
            ref={dropupRef}
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="w-56 bg-[#222120] rounded-xl ring-1 ring-white/[0.08] shadow-2xl shadow-black/60 py-1"
            style={{ position: 'fixed', left: dropupPos.left, bottom: dropupPos.bottom, zIndex: 9999 }}
          >
            {mayaTiers.map((tier, i) => (
              <button key={i} onClick={() => { setSelectedTier(i); setShowTierMenu(false) }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors ${selectedTier === i ? 'bg-[#E8601A]/[0.06]' : 'hover:bg-white/[0.04]'}`}>
                <div>
                  <div className={`text-[12px] font-medium ${selectedTier === i ? 'text-[#E8601A]' : 'text-[#D4D0CA]'}`}>{tier.label}</div>
                  <div className="text-[10px] text-[#6B6560]">{tier.description}</div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-[9px] text-[#6B6560]">In {tier.inputPrice}</div>
                  <div className="text-[9px] text-[#6B6560]">Out {tier.outputPrice}</div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

ChatPanel.displayName = 'ChatPanel'

function BuilderScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  if (isAtBottom) return null
  return (
    <div className="sticky bottom-0 left-0 right-0 flex justify-center z-20 pb-2">
      <button
        onClick={() => scrollToBottom()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[#222120] border border-white/[0.08] text-[#D4D0CA] hover:bg-[#2A2928] hover:border-[#E8601A]/20 transition-all shadow-lg"
      >
        <span className="i-ph:arrow-down text-sm animate-bounce" />
        Latest
      </button>
    </div>
  )
}
