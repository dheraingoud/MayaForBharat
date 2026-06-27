// MAYA-specific: LLM Manager tests
// Tests provider discovery and model listing

import { describe, expect, it, vi } from 'vitest';
import { LLMManager } from '@/lib/workbench/llm/manager';

describe('LLMManager', () => {
  it('should be a singleton', () => {
    const env = {} as Record<string, string>;
    const a = LLMManager.getInstance(env);
    const b = LLMManager.getInstance(env);
    expect(a).toBe(b);
  });

  it('should return a list of providers', () => {
    const env = {} as Record<string, string>;
    const manager = LLMManager.getInstance(env);
    const providers = manager.getAllProviders();
    
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);
  });

  it('should have provider names', () => {
    const env = {} as Record<string, string>;
    const manager = LLMManager.getInstance(env);
    const providers = manager.getAllProviders();
    
    for (const provider of providers) {
      expect(provider.name).toBeDefined();
      expect(typeof provider.name).toBe('string');
      expect(provider.name.length).toBeGreaterThan(0);
    }
  });

  it('should return static models for known providers', () => {
    const env = {} as Record<string, string>;
    const manager = LLMManager.getInstance(env);
    const providers = manager.getAllProviders();
    
    // At least some providers should have static models
    const withModels = providers.filter(p => p.staticModels && p.staticModels.length > 0);
    expect(withModels.length).toBeGreaterThan(0);
  });

  it('should get a provider by name', () => {
    const env = {} as Record<string, string>;
    const manager = LLMManager.getInstance(env);
    const providers = manager.getAllProviders();
    
    if (providers.length > 0) {
      const firstProvider = providers[0];
      const found = manager.getProvider(firstProvider.name);
      expect(found).toBeDefined();
      expect(found?.name).toBe(firstProvider.name);
    }
  });

  it('should return undefined for unknown provider', () => {
    const env = {} as Record<string, string>;
    const manager = LLMManager.getInstance(env);
    const found = manager.getProvider('nonexistent_provider_xyz');
    expect(found).toBeUndefined();
  });
});
