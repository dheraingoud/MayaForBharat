'use client';

/*
 * DynamicStatusPill — Phase R2 single authoritative streaming state.
 *
 * Collapses MAYA's three competing streaming signals (ThoughtBox "Thinking…"
 * ledger, AssistantMessage inline status pill, cursor blink) into ONE
 * DynamicIsland-style pill that morphs between four states as the model
 * works: reading → thinking → building → done. Sits at the end of the
 * assistant column in Messages.client. Bilingual (useLanguage).
 *
 * Source of truth: the last assistant message's text parts + isStreaming.
 * The bolt protocol is streamed as TEXT parts (<boltArtifact> XML), so the
 * raw content carries the open/close tags we need to derive the stage — no
 * deep action-runner wiring required. Defensive on undefined parts.
 *
 * Double-bezel per the R2 lock: outer accent ring (bezel-ring class) + inner
 * inset hairline (bezel-inset). Spring layoutId morphs the label so the pill
 * reads as one fluid island, not a re-rendering chip. No emoji, no neon.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { UIMessage, TextUIPart, ReasoningUIPart } from 'ai';
import { detectLanguage, type ChatLanguage } from '@/lib/workbench/utils/detectLanguage';
import { useLanguage } from '@/app/providers';

type StatusKey = 'reading' | 'thinking' | 'writing' | 'running' | 'starting' | 'responding' | 'done';

interface DynamicStatusPillProps {
  isStreaming: boolean;
  messages: UIMessage[];
}

function lastAssistantContent(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'assistant') continue;
    return (messages[i].parts ?? [])
      .filter((p): p is TextUIPart => p.type === 'text' && 'text' in p)
      .map((p) => p.text)
      .join('');
  }
  return '';
}

function lastAssistantIsReasoning(messages: UIMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'assistant') continue;
    const parts = messages[i].parts ?? [];
    if (parts.length === 0) return false;
    return parts[parts.length - 1].type === 'reasoning';
  }
  return false;
}

function lastWritingFileName(content: string): string | undefined {
  const m = content.match(/<boltAction[^>]*filePath="([^"]+)"[^>]*>(?![\s\S]*<\/boltAction>)/);
  return m ? m[1].split('/').pop() : undefined;
}

function deriveStatusKey(isStreaming: boolean, messages: UIMessage[]): StatusKey | null {
  if (!isStreaming) return null;
  // No assistant reply yet (or last msg is user) → reading the prompt.
  const last = messages[messages.length - 1];
  if (!last || last.role === 'user') return 'reading';
  if (lastAssistantIsReasoning(messages)) return 'thinking';
  const content = lastAssistantContent(messages);
  if (!content) return 'reading';
  if (content.match(/<boltAction[^>]*filePath="([^"]+)"[^>]*>(?![\s\S]*<\/boltAction>)/)) return 'writing';
  if (content.match(/<boltAction[^>]*type="shell"[^>]*>(?![\s\S]*<\/boltAction>)/)) return 'running';
  if (content.match(/<boltAction[^>]*type="start"[^>]*>(?![\s\S]*<\/boltAction>)/)) return 'starting';
  if (content.includes('<boltArtifact') && !content.includes('</boltArtifact>')) return 'starting';
  if (content.trim().length > 0 && !content.includes('<boltArtifact')) return 'responding';
  return 'reading';
}

const LABEL: Record<ChatLanguage, Record<StatusKey, (file?: string) => string>> = {
  en: {
    reading: () => 'MAYA is reading your prompt…',
    thinking: () => 'Reasoning',
    writing: (f) => (f ? `Writing ${f}` : 'Writing file'),
    running: () => 'Running command',
    starting: () => 'Starting dev server',
    responding: () => 'Responding',
    done: () => 'Build ready',
  },
  hi: {
    reading: () => 'MAYA aapka prompt padh rahi hoon…',
    thinking: () => 'Soch rahi hoon',
    writing: (f) => (f ? `${f} likh rahi hoon` : 'File likh rahi hoon'),
    running: () => 'Command chala rahi hoon',
    starting: () => 'Dev server shuru kar rahi hoon',
    responding: () => 'Jawaab de rahi hoon',
    done: () => 'Build taiyaar',
  },
};

const ICON: Record<StatusKey, string> = {
  reading: 'i-ph:circle-notch',
  thinking: 'i-ph:brain',
  writing: 'i-ph:file-code',
  running: 'i-ph:terminal-window',
  starting: 'i-ph:rocket-launch',
  responding: 'i-ph:circle-notch',
  done: 'i-ph:check-circle',
};

export const DynamicStatusPill = memo(({ isStreaming, messages }: DynamicStatusPillProps) => {
  const { language: uiLang } = useLanguage();
  // Re-derive per message (user may switch languages mid-conversation).
  const lastUserText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'user') continue;
      return (messages[i].parts ?? [])
        .filter((p): p is TextUIPart => p.type === 'text' && 'text' in p)
        .map((p) => p.text)
        .join('');
    }
    return '';
  }, [messages]);
  const lang = detectLanguage(lastUserText) === 'hi' || uiLang === 'hi' ? 'hi' : 'en';

  const statusKey = deriveStatusKey(isStreaming, messages);
  const fileName = statusKey === 'writing' ? lastWritingFileName(lastAssistantContent(messages)) : undefined;

  // Elapsed timer — only ticks while streaming.
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isStreaming) {
      setElapsed(0);
      startRef.current = null;
      return;
    }
    if (startRef.current === null) startRef.current = Date.now();
    const id = setInterval(() => {
      if (startRef.current !== null) setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Brief "done" plateau: when streaming just ended (and we had streamed),
  // show the done pill for ~2.4s so the user gets a closed-loop confirmation.
  const [showDone, setShowDone] = useState(false);
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      return;
    }
    if (wasStreamingRef.current) {
      wasStreamingRef.current = false;
      setShowDone(true);
      const t = setTimeout(() => setShowDone(false), 2400);
      return () => clearTimeout(t);
    }
  }, [isStreaming]);

  if (!statusKey && !showDone) return null;

  const activeKey: StatusKey = statusKey ?? 'done';
  // Icon motion: reading/thinking/responding spin (Tailwind animate-spin
  // keyframe is emitted globally because Bolt uses animate-spin elsewhere);
  // writing/running/starting breathe via maya-pulse-dot; done is static.
  const iconAnim =
    activeKey === 'done'
      ? ''
      : activeKey === 'thinking' || activeKey === 'reading' || activeKey === 'responding'
        ? 'animate-spin'
        : 'maya-pulse-dot';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeKey}
        layout
        initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
        transition={{ type: 'spring', stiffness: 120, damping: 22, duration: 0.5 }}
        className="mt-6 inline-flex"
      >
        <div
          className="inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full bg-[#E8601A]/[0.05] bezel-ring text-[12px] font-medium"
          style={{ color: activeKey === 'done' ? '#2D7A4F' : '#6B6560' }}
        >
          <span
            className={`${ICON[activeKey]} ${iconAnim}`}
            style={{
              width: '14px',
              height: '14px',
              color: activeKey === 'done' ? '#2D7A4F' : '#E8601A',
            }}
          />
          <span className="text-[12.5px] font-medium leading-tight whitespace-nowrap">
            {LABEL[lang][activeKey](fileName)}
            {elapsed > 0 && activeKey !== 'done' && (
              <span className="ml-1.5 text-[#9E9890] font-mono text-[11px]">· {elapsed}s</span>
            )}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

DynamicStatusPill.displayName = 'DynamicStatusPill';
export default DynamicStatusPill;
