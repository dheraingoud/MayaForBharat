// @ts-nocheck
// Source: bolt.diy/app/routes/api.chat.ts
// Ported for AI SDK v6: streamText().toUIMessageStreamResponse()
// Ported: Remix action → Next.js POST handler
// Enhanced: Always-on context compaction at 60% token usage

import { NextRequest } from 'next/server';
import { generateId } from 'ai';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS } from '@/lib/workbench/llm/constants';
import { CONTINUE_PROMPT } from '@/lib/workbench/prompts/prompts';
import { streamText, type Messages, type StreamingOptions } from '@/lib/workbench/llm/stream-text';
import type { IProviderSetting } from '@/lib/workbench/types/model';
import { createScopedLogger } from '@/lib/workbench/utils/logger';
import { extractPropertiesFromMessage } from '@/lib/workbench/llm/utils';
import type { DesignScheme } from '@/lib/workbench/types/design-scheme';
import { createSummary } from '@/lib/workbench/llm/create-summary';
import { getFilePaths, selectContext } from '@/lib/workbench/llm/select-context';
import type { FileMap } from '@/lib/workbench/llm/constants';

// Force dynamic — this route uses LLM streaming that can't be statically evaluated
export const dynamic = 'force-dynamic';

const logger = createScopedLogger('api.chat');

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').map((c) => c.trim()).forEach((item) => {
    const [name, ...rest] = item.split('=');
    if (name && rest) {
      cookies[decodeURIComponent(name.trim())] = decodeURIComponent(rest.join('=').trim());
    }
  });
  return cookies;
}

/**
 * Estimate token count from messages using the ~4 chars per token heuristic.
 */
function estimateTokens(messages: Messages): number {
  let totalChars = 0;
  for (const msg of messages) {
    if (!msg.content) continue;
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    totalChars += content.length;
  }
  return Math.ceil(totalChars / 4);
}

// Default max context window for models (conservative estimate)
const DEFAULT_MAX_CONTEXT = 128000;

export async function POST(request: NextRequest) {
  const { messages, files, contextFiles, promptId, contextOptimization, supabase, chatMode, designScheme, pipelineInstructions, appId } =
    await request.json() as {
      messages: Messages;
      files: any;
      contextFiles?: any;
      promptId?: string;
      contextOptimization: boolean;
      chatMode: 'discuss' | 'build';
      designScheme?: DesignScheme;
      supabase?: {
        isConnected: boolean;
        hasSelectedProject: boolean;
        credentials?: {
          anonKey?: string;
          supabaseUrl?: string;
        };
      };
      pipelineInstructions?: string;
      appId?: string;
    };

  const cookieHeader = request.headers.get('Cookie');
  let apiKeys: Record<string, string> = {};
  let providerSettings: Record<string, IProviderSetting> = {};

  try { apiKeys = JSON.parse(parseCookies(cookieHeader || '').apiKeys || '{}'); } catch { /* ignore */ }
  try { providerSettings = JSON.parse(parseCookies(cookieHeader || '').providers || '{}'); } catch { /* ignore */ }

  // Ensure messages is always an array (AI SDK transport can send unexpected formats)
  const safeMessages: Messages = Array.isArray(messages) ? messages : [];
  if (safeMessages.length === 0) {
    return new Response(JSON.stringify({ error: true, message: 'No messages provided' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const filePaths = getFilePaths(files || {});
    let filteredFiles: FileMap | undefined = contextFiles;
    let summary: string | undefined = undefined;
    let messageSliceId = 0;

    // ─── Context compaction (always-on at 60% token usage) ────────────────
    const estimatedTokens = estimateTokens(safeMessages);
    const compactionThreshold = DEFAULT_MAX_CONTEXT * 0.6;
    const shouldCompact = filePaths.length > 0 && (estimatedTokens > compactionThreshold || safeMessages.length > 10);

    if (shouldCompact) {
      logger.info(`[Compaction] Triggered: ~${estimatedTokens} tokens estimated, ${safeMessages.length} messages, ${filePaths.length} files`);

      // Slice messages: keep only last 3 for main context
      if (safeMessages.length > 3) {
        messageSliceId = safeMessages.length - 3;
      }

      try {
        // Step 1: Generate conversation summary
        logger.debug('[Compaction] Generating chat summary...');
        summary = await createSummary({
          messages: [...safeMessages],
          env: process.env as Record<string, string>,
          apiKeys,
          providerSettings,
          promptId,
          contextOptimization: true,
          onFinish(resp) {
            if (resp.usage) {
              logger.debug('[Compaction] Summary tokens:', JSON.stringify(resp.usage));
            }
          },
        });
        logger.debug('[Compaction] Summary generated successfully');

        // Step 2: Select relevant context files
        logger.debug('[Compaction] Selecting context files...');
        try {
          filteredFiles = await selectContext({
            messages: [...safeMessages],
            env: process.env as Record<string, string>,
            apiKeys,
            files,
            providerSettings,
            promptId,
            contextOptimization: true,
            summary: summary || '',
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('[Compaction] Context selection tokens:', JSON.stringify(resp.usage));
              }
            },
          });

          if (filteredFiles) {
            logger.info(`[Compaction] Selected ${Object.keys(filteredFiles).length} context files`);
          }
        } catch (contextErr) {
          // selectContext can fail if no files match — that's ok, use all files
          logger.warn('[Compaction] Context selection failed, using all files:', contextErr);
          filteredFiles = contextFiles;
        }
      } catch (summaryErr) {
        // If summary generation fails, proceed without compaction
        logger.warn('[Compaction] Summary generation failed, skipping compaction:', summaryErr);
        summary = undefined;
        messageSliceId = 0;
      }
    }

    const options: StreamingOptions = {
      supabaseConnection: supabase,
      onFinish: async ({ text: content, finishReason, usage }) => {
        logger.debug('usage', JSON.stringify(usage));

        if (finishReason !== 'length') {
          logger.info('Response complete');
          return;
        }

        logger.info(`Reached max token limit: Will need continuation`);
      },
    };

    // Inject the hidden pipeline instructions into the LAST user message so the
    // model still sees them on the server side but the chat UI never displayed
    // them to the user. We mutate a shallow copy, never the client payload.
    const finalMessages = typeof pipelineInstructions === 'string' && pipelineInstructions
      ? [...safeMessages]
      : [...safeMessages];
    if (typeof pipelineInstructions === 'string' && pipelineInstructions) {
      for (let i = finalMessages.length - 1; i >= 0; i--) {
        const m = finalMessages[i];
        if (m && m.role === 'user') {
          const original =
            typeof m.content === 'string' ? m.content : '';
          const appended = `${original}${pipelineInstructions}`;
          finalMessages[i] = { ...m, content: appended };
          break;
        }
      }
    }

    const result = await streamText({
      messages: finalMessages,
      env: process.env as Record<string, string>,
      options,
      apiKeys,
      files,
      contextFiles: filteredFiles,
      providerSettings,
      promptId,
      contextOptimization: shouldCompact,
      chatMode,
      designScheme,
      summary,
      messageSliceId,
    });

    // ─── Bulletproof: detect "empty response" before it reaches the UI ─────────
    // Some reasoning models (e.g. stepfun-ai/step-3.7-flash) can finish a
    // response without producing any visible text — they run out of budget
    // inside `<reasoning>` blocks or hit rate limits mid-stream. Without this
    // guard the UI shows "Model returned an empty response. Try sending the
    // message again…" and the user has to manually retry.
    //
    // We probe `result.text` once (it's already the aggregate of all text
    // deltas) — if it's empty we issue ONE retry with a short reminder
    // asking the model to emit ONLY the visible response. If both attempts
    // fail we still return a stream — the client toast will read whatever we
    // surface as a final assistant message.
    let finalResult: Awaited<ReturnType<typeof streamText>> = result;
    try {
      const initialText = (await Promise.race([
        (result as any).text,
        new Promise<string>((resolve) => setTimeout(() => resolve('__pending__'), 250)),
      ])) as string;
      if (initialText !== '__pending__' && (!initialText || initialText.trim().length === 0)) {
        logger.warn('[Chat] Empty response detected; retrying once with short reminder');
        // Retry by mutating the last user message to add a system reminder.
        const retryMessages = finalMessages.map((m, i) => {
          if (i === finalMessages.length - 1 && m && m.role === 'user') {
            const original = typeof m.content === 'string' ? m.content : '';
            return {
              ...m,
              content: `${original}\n\n[SYSTEM REMINDER] Your previous response was empty. Reply with ONLY the visible answer — no reasoning, no preamble. If you must reason, keep it under 50 words.`,
            } as typeof m;
          }
          return m;
        });
        finalResult = await streamText({
          messages: retryMessages,
          env: process.env as Record<string, string>,
          options,
          apiKeys,
          files,
          contextFiles: filteredFiles,
          providerSettings,
          promptId,
          contextOptimization: shouldCompact,
          chatMode,
          designScheme,
          summary,
          messageSliceId,
        });
      }
    } catch (probeErr) {
      // Probe failed (no `.text` field on this provider); fall through to
      // the original stream — surfacing whatever the model emitted.
      logger.debug('[Chat] No .text probe available; skipping empty-response retry', probeErr);
    }

    const stream = finalResult.toUIMessageStreamResponse({
      headers: {
        'Cache-Control': 'no-cache, no-transform',
      },
    });
    return stream;
  } catch (error: any) {
    logger.error(error);

    if (error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'Invalid or missing API key',
          statusCode: 401,
          isRetryable: false,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: true,
        message: error.message || 'An unexpected error occurred',
        statusCode: error.statusCode || 500,
      }),
      {
        status: error.statusCode || 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
