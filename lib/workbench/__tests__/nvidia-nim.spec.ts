// MAYA-specific: NIM provider integration tests
// Tests the NvidiaNIM provider registration and model listing

import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('NvidiaNIM Provider', () => {
  it('should be importable', async () => {
    const mod = await import('@/lib/workbench/llm/providers/nvidia-nim');
    expect(mod.default).toBeDefined();
  });

  it('should have correct name', async () => {
    const mod = await import('@/lib/workbench/llm/providers/nvidia-nim');
    const provider = new mod.default();
    expect(provider.name).toBe('NvidiaNIM');
  });

  it('should have static models', async () => {
    const mod = await import('@/lib/workbench/llm/providers/nvidia-nim');
    const provider = new mod.default();
    expect(provider.staticModels.length).toBeGreaterThan(0);
  });

  it('should include MAYA agent models', async () => {
    const mod = await import('@/lib/workbench/llm/providers/nvidia-nim');
    const provider = new mod.default();
    const modelIds = provider.staticModels.map(m => m.name);
    
    expect(modelIds).toContain('stepfun-ai/step-3.7-flash');
    expect(modelIds).toContain('minimaxai/minimax-m3');
    expect(modelIds).toContain('meta/llama-3.3-70b-instruct');
  });

  it('should have correct config', async () => {
    const mod = await import('@/lib/workbench/llm/providers/nvidia-nim');
    const provider = new mod.default();
    expect(provider.config.apiTokenKey).toBe('NVIDIA_API_KEY_1');
    expect(provider.config.baseUrl).toBe('https://integrate.api.nvidia.com/v1');
  });

  it('should have getApiKeyLink', async () => {
    const mod = await import('@/lib/workbench/llm/providers/nvidia-nim');
    const provider = new mod.default();
    expect(provider.getApiKeyLink).toBeDefined();
    expect(provider.getApiKeyLink).toContain('nvidia');
  });

  it('should be registered in LLMManager', async () => {
    const { LLMManager } = await import('@/lib/workbench/llm/manager');
    const manager = LLMManager.getInstance({} as any);
    const provider = manager.getProvider('NvidiaNIM');
    
    // Provider should be registered
    expect(provider).toBeDefined();
    expect(provider?.name).toBe('NvidiaNIM');
  });

  it('should list NIM static models in global model list', async () => {
    const { LLMManager } = await import('@/lib/workbench/llm/manager');
    const manager = LLMManager.getInstance({} as any);
    const models = manager.getModelList();
    
    const nimModels = models.filter(m => m.provider === 'NvidiaNIM');
    expect(nimModels.length).toBeGreaterThan(0);
  });
});

describe('NIM Client Streaming', () => {
  it('should export nimChatStream', async () => {
    const mod = await import('@/lib/nim-client');
    expect(mod.nimChatStream).toBeDefined();
    expect(typeof mod.nimChatStream).toBe('function');
  });

  it('should export MODELS registry', async () => {
    const mod = await import('@/lib/nim-client');
    expect(mod.MODELS).toBeDefined();
    expect(mod.MODELS.BUILDER).toBeDefined();
    expect(mod.MODELS.VERIFIER).toBeDefined();
    expect(mod.MODELS.PLANNER).toBeDefined();
  });

  it('should export nimChat', async () => {
    const mod = await import('@/lib/nim-client');
    expect(mod.nimChat).toBeDefined();
    expect(typeof mod.nimChat).toBe('function');
  });

  it('should export nimChatJSON', async () => {
    const mod = await import('@/lib/nim-client');
    expect(mod.nimChatJSON).toBeDefined();
    expect(typeof mod.nimChatJSON).toBe('function');
  });

  it('should export nimVision', async () => {
    const mod = await import('@/lib/nim-client');
    expect(mod.nimVision).toBeDefined();
    expect(typeof mod.nimVision).toBe('function');
  });
});
