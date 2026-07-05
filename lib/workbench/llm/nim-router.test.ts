// @ts-nocheck
/**
 * Regression test for the "live build stream stuck at `{"type":"start"}`" bug.
 *
 * Root cause (found 2026-07-05 via systematic-debugging):
 *   1. stepfun-ai/step-3.7-flash is a REASONING model (emits delta.reasoning_content
 *      BEFORE the answer content). It was NOT flagged as reasoning in
 *      `isReasoningModel` / nim-router's `isReasoning` → stream-text.ts used
 *      `maxTokens` (not `maxCompletionTokens`) and nim-router did NOT inject
 *      `chat_template_kwargs.thinking`. The model burned the whole 16384-token
 *      budget on reasoning, the answer (bolt XML) never streamed, and the SSE
 *      stayed at `{"type":"start"}` until the client timed out.
 *   2. nim-router used `createOpenAI` from `@ai-sdk/openai`, whose compatible
 *      chat model does NOT parse NIM's `delta.reasoning_content` field — so even
 *      when reasoning DID stream, the SDK dropped every reasoning delta and the
 *      user never saw a "Thinking…" pill (breaks the vercel progressive-UI mandate).
 *      The fix: use `createOpenAICompatible` from `@ai-sdk/openai-compatible`,
 *      which parses `reasoning_content` → reasoning-start/delta/end →
 *      ReasoningUIPart → ThoughtBox streams progressively.
 *
 * These tests pin both fixes so a regression is caught before the build stream
 * silently breaks again.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Stub an API key so NimKeyRotator.nextKey() doesn't throw on import-time checks.
process.env.NVIDIA_API_KEY_1 = process.env.NVIDIA_API_KEY_1 || 'test-key-vitest';

import { isReasoningModel } from './constants';
import { createNimModel } from './nim-router';

describe('nim-router reasoning wiring (regression: stuck-at-start stream)', () => {
  it('flags stepfun-ai/step-3.7-flash as a reasoning model', () => {
    // step-3.7-flash emits delta.reasoning_content; must use maxCompletionTokens
    // + chat_template_kwargs.thinking so the answer (bolt XML) actually streams.
    expect(isReasoningModel('stepfun-ai/step-3.7-flash')).toBe(true);
  });

  it('flags step-3 family (other stepfun variants) as reasoning', () => {
    expect(isReasoningModel('stepfun-ai/step-3-flash')).toBe(true);
  });

  it('createNimModel uses an OpenAI-CHAT-COMPATIBLE provider that parses reasoning_content', () => {
    // `@ai-sdk/openai`'s createOpenAI chat model DROPS delta.reasoning_content.
    // `@ai-sdk/openai-compatible`'s createOpenAICompatible chat model parses it
    // → reasoning-start/delta/end frames → ReasoningUIPart → ThoughtBox.
    const model = createNimModel('stepfun-ai/step-3.7-flash');
    const ctor = model?.constructor?.name;
    expect(ctor).toBe('OpenAICompatibleChatLanguageModel');
  });

  it('createNimModel for minimax-m3 also uses the compatible provider', () => {
    const model = createNimModel('minimaxai/minimax-m3');
    const ctor = model?.constructor?.name;
    expect(ctor).toBe('OpenAICompatibleChatLanguageModel');
  });
});
