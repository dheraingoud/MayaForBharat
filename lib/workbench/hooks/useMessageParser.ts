// Source: bolt.diy/app/lib/hooks/useMessageParser.ts
// Ported: Message → UIMessage, extractTextContent → parts-based
// Enhanced: exported parser singleton + replayMessages for project restoration

import type { UIMessage } from 'ai';
import { useCallback, useState } from 'react';
import { StreamingMessageParser } from '@/lib/workbench/message-parser';
import { workbenchStore } from '@/lib/workbench/stores/workbench';
import { createScopedLogger } from '@/lib/workbench/utils/logger';

const logger = createScopedLogger('useMessageParser');

export const messageParser = new StreamingMessageParser({
  callbacks: {
    onArtifactOpen: (data: any) => {
      logger.trace('onArtifactOpen', data);
      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);
    },
    onArtifactClose: (data: any) => {
      logger.trace('onArtifactClose');
      workbenchStore.updateArtifact(data, { closed: true });
    },
    onActionOpen: (data: any) => {
      logger.trace('onActionOpen', data.action);
      if (data.action.type === 'file') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data: any) => {
      logger.trace('onActionClose', data.action);
      if (data.action.type !== 'file') {
        workbenchStore.addAction(data);
      }
      workbenchStore.runAction(data);
    },
    onActionStream: (data: any) => {
      logger.trace('onActionStream', data.action);
      workbenchStore.runAction(data, true);
    },
  },
});

/**
 * Pure next-state for parsed-messages. Preserves object identity when a
 * re-parse yields no change, so `setParsedMessages` does NOT trigger a
 * re-render on no-op. Without this, every sampled parse (createSampler 50ms)
 * spreads a fresh object → BuilderPage effect deps `[messages, isLoading,
 * parseMessages]` re-fires → "Maximum update depth exceeded" during the
 * file-write flood. The loop: new identity setState → re-render → effect →
 * parseMessages → new identity setState.
 *
 * @param prev     existing parsed map (by message index)
 * @param index    message index being parsed
 * @param delta    new content parsed this pass
 * @param isLoading streaming — append to existing; else replace
 * @returns prev (same ref) on no-op, else a new object
 */
export function nextParsedState(
  prev: { [key: number]: string },
  index: number,
  delta: string,
  isLoading: boolean,
): { [key: number]: string } {
  const existing = prev[index] || '';
  const next = isLoading ? existing + delta : delta;
  if (next === existing) return prev;
  return { ...prev, [index]: next };
}

function extractTextContent(message: UIMessage): string {
  // AI SDK v6: UIMessage has parts array instead of content string
  if ('parts' in message && Array.isArray(message.parts)) {
    return message.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text)
      .join('');
  }
  // Fallback for backward compat
  if ('content' in message && typeof (message as any).content === 'string') {
    return (message as any).content;
  }
  return '';
}

/**
 * Replay restored messages through the StreamingMessageParser to
 * reconstruct artifacts & trigger file actions in the WebContainer.
 * This is essential for preview restoration when loading existing projects.
 *
 * IMPORTANT: Message IDs are registered as "reloaded" before replay so that
 * shell/start actions from historical messages are NOT re-executed.
 * Only file-write actions go through. The auto-start effect or snapshot
 * restore handles npm install + dev server separately.
 */
export function replayMessages(messages: UIMessage[]) {
  logger.info(`[Replay] Replaying ${messages.length} messages for preview restoration`);

  // Register ALL message IDs as "replayed" so shell/start actions are suppressed
  // during replay — we only want file writes, not command re-execution.
  // Uses setReplayedMessages (not setReloadedMessages) to distinguish from
  // snapshot restore messages which DO need their shell/start to execute.
  const messageIds = messages.map(m => m.id);
  workbenchStore.setReplayedMessages(messageIds);

  messageParser.reset();

  for (const message of messages) {
    if (message.role === 'assistant') {
      const content = extractTextContent(message);
      if (content) {
        // Parse the full content at once (non-streaming mode)
        messageParser.parse(message.id, content);
      }
    }
  }

  logger.info('[Replay] Complete — file actions applied, shell/start actions suppressed');
}

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});

  const parseMessages = useCallback((messages: UIMessage[], isLoading: boolean) => {
    // Always reset when not actively streaming to prevent stale parsed content bleeding across messages
    if (!isLoading) {
      messageParser.reset();
    }

    for (const [index, message] of messages.entries()) {
      // Only parse assistant messages — user messages contain [Model:]/[Provider:] tags
      // and should never be fed into the bolt artifact streaming parser
      if (message.role === 'assistant') {
        const newParsedContent = messageParser.parse(message.id, extractTextContent(message));
        setParsedMessages((prevParsed) => nextParsedState(prevParsed, index, newParsedContent, isLoading));
      }
    }
  }, []);

  return { parsedMessages, parseMessages };
}
