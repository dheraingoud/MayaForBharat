// End-to-end integration tests for MAYA Workbench frontend-backend connection
// Tests: CSS design system, provider registration, API wiring, navigation, persistence

import { describe, expect, it, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
// 1. CSS Design System Tests
// ═══════════════════════════════════════════════════════════════════

describe('Bolt CSS Design System', () => {
  it('workbench.css file should exist and contain bolt-elements vars', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const cssPath = path.resolve(__dirname, '../../../app/workbench.css');
    const css = fs.readFileSync(cssPath, 'utf-8');

    // Should define all critical CSS vars
    expect(css).toContain('--bolt-elements-bg-depth-1');
    expect(css).toContain('--bolt-elements-bg-depth-2');
    expect(css).toContain('--bolt-elements-bg-depth-3');
    expect(css).toContain('--bolt-elements-textPrimary');
    expect(css).toContain('--bolt-elements-textSecondary');
    expect(css).toContain('--bolt-elements-borderColor');
    expect(css).toContain('--bolt-elements-button-primary-background');
    expect(css).toContain('--bolt-elements-button-danger-text');
    expect(css).toContain('--bolt-elements-icon-success');
    expect(css).toContain('--bolt-elements-icon-error');
  });

  it('should have both dark and light theme definitions', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const css = fs.readFileSync(path.resolve(__dirname, '../../../app/workbench.css'), 'utf-8');

    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain("[data-theme='light']");
  });

  it('should have terminal color definitions', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const css = fs.readFileSync(path.resolve(__dirname, '../../../app/workbench.css'), 'utf-8');

    expect(css).toContain('--bolt-terminal-foreground');
    expect(css).toContain('--bolt-terminal-red');
    expect(css).toContain('--bolt-terminal-green');
    expect(css).toContain('--bolt-terminal-blue');
  });

  it('should have workbench layout tokens', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const css = fs.readFileSync(path.resolve(__dirname, '../../../app/workbench.css'), 'utf-8');

    expect(css).toContain('--header-height');
    expect(css).toContain('--chat-max-width');
    expect(css).toContain('--chat-min-width');
    expect(css).toContain('--workbench-width');
  });

  it('globals.css should import workbench.css', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const globals = fs.readFileSync(path.resolve(__dirname, '../../../app/globals.css'), 'utf-8');

    expect(globals).toContain("@import './workbench.css'");
  });

  it('globals.css should have bolt-elements color theme tokens', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const globals = fs.readFileSync(path.resolve(__dirname, '../../../app/globals.css'), 'utf-8');

    expect(globals).toContain('--color-bolt-elements-textPrimary');
    expect(globals).toContain('--color-bolt-elements-bg-depth-1');
    expect(globals).toContain('--color-bolt-elements-button-primary-text');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. COOP/COEP Headers Tests
// ═══════════════════════════════════════════════════════════════════

describe('COOP/COEP Headers (WebContainer)', () => {
  it('next.config.mjs should have workbench COOP/COEP headers', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const config = fs.readFileSync(path.resolve(__dirname, '../../../next.config.mjs'), 'utf-8');

    expect(config).toContain('Cross-Origin-Embedder-Policy');
    expect(config).toContain('Cross-Origin-Opener-Policy');
    expect(config).toContain('/workbench');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Navigation Tests
// ═══════════════════════════════════════════════════════════════════

describe('Navigation', () => {
  it('should have dashboard link in navigation', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const nav = fs.readFileSync(path.resolve(__dirname, '../../../components/navigation.tsx'), 'utf-8');

    expect(nav).toContain("'/dashboard'");
    expect(nav).toContain('Dashboard');
  });

  it('landing page should navigate to /workbench on submit', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(path.resolve(__dirname, '../../../app/page.tsx'), 'utf-8');

    expect(page).toContain('/workbench');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Provider Registration Tests (All 23)
// ═══════════════════════════════════════════════════════════════════

describe('All 23 Providers Registered', () => {
  it('registry should export all 23 providers', async () => {
    const registry = await import('@/lib/workbench/llm/registry');
    const exports = Object.keys(registry);

    expect(exports).toContain('AnthropicProvider');
    expect(exports).toContain('OpenAIProvider');
    expect(exports).toContain('GoogleProvider');
    expect(exports).toContain('GroqProvider');
    expect(exports).toContain('MistralProvider');
    expect(exports).toContain('DeepseekProvider');
    expect(exports).toContain('OpenRouterProvider');
    expect(exports).toContain('TogetherProvider');
    expect(exports).toContain('PerplexityProvider');
    expect(exports).toContain('XAIProvider');
    expect(exports).toContain('CohereProvider');
    expect(exports).toContain('HuggingFaceProvider');
    expect(exports).toContain('FireworksProvider');
    expect(exports).toContain('CerebrasProvider');
    expect(exports).toContain('HyperbolicProvider');
    expect(exports).toContain('AmazonBedrockProvider');
    expect(exports).toContain('GithubProvider');
    expect(exports).toContain('MoonshotProvider');
    expect(exports).toContain('ZaiProvider');
    expect(exports).toContain('OllamaProvider');
    expect(exports).toContain('LMStudioProvider');
    expect(exports).toContain('OpenAILikeProvider');
    expect(exports).toContain('NvidiaNIMProvider');

    expect(exports.length).toBeGreaterThanOrEqual(23);
  });

  it('LLMManager should register all providers', async () => {
    const { LLMManager } = await import('@/lib/workbench/llm/manager');
    const manager = LLMManager.getInstance({} as any);
    const providers = manager.getAllProviders();

    expect(providers.length).toBeGreaterThanOrEqual(20);

    const providerNames = providers.map(p => p.name);
    expect(providerNames).toContain('OpenAI');
    expect(providerNames).toContain('Anthropic');
    expect(providerNames).toContain('NvidiaNIM');
  });

  it('NIM provider should have MAYA agent models', async () => {
    const { LLMManager } = await import('@/lib/workbench/llm/manager');
    const manager = LLMManager.getInstance({} as any);
    const nim = manager.getProvider('NvidiaNIM');

    expect(nim).toBeDefined();
    const modelNames = nim!.staticModels.map(m => m.name);
    expect(modelNames).toContain('stepfun-ai/step-3.7-flash');
    expect(modelNames).toContain('minimaxai/minimax-m3');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. API Route Tests
// ═══════════════════════════════════════════════════════════════════

describe('API Route Files Exist', () => {
  const apiRoutes = [
    'chat', 'models', 'health', 'enhancer',
    'configured-providers', 'git-info', 'git-proxy',
    'github-branches', 'github-stats', 'github-user',
  ];

  apiRoutes.forEach(route => {
    it(`/api/workbench/${route} route should exist`, async () => {
      const fs = await import('fs');
      const path = await import('path');
      const routePath = path.resolve(__dirname, `../../../app/api/workbench/${route}/route.ts`);
      expect(fs.existsSync(routePath)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Workbench Page Tests
// ═══════════════════════════════════════════════════════════════════

describe('Workbench Page', () => {
  it('page.tsx should exist', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const pagePath = path.resolve(__dirname, '../../../app/workbench/page.tsx');
    expect(fs.existsSync(pagePath)).toBe(true);
  });

  it('layout.tsx should exist with ToastContainer', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const layoutPath = path.resolve(__dirname, '../../../app/workbench/layout.tsx');
    expect(fs.existsSync(layoutPath)).toBe(true);

    const layout = fs.readFileSync(layoutPath, 'utf-8');
    expect(layout).toContain('ToastContainer');
  });

  it('page.tsx should dynamically import BuilderPage', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const page = fs.readFileSync(path.resolve(__dirname, '../../../app/workbench/page.tsx'), 'utf-8');

    expect(page).toContain('dynamic(');
    expect(page).toContain('BuilderPage');
    expect(page).toContain('ssr: false');
  });

  it('WorkbenchLayout component should exist', async () => {
    const fs = await import('fs');
    const path = await import('path');
    expect(fs.existsSync(path.resolve(__dirname, '../components/workbench/WorkbenchLayout.tsx'))).toBe(true);
  });

  it('WorkbenchLayout should import Chat, Preview, and TerminalTabs', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const layout = fs.readFileSync(
      path.resolve(__dirname, '../components/workbench/WorkbenchLayout.tsx'), 'utf-8'
    );

    expect(layout).toContain('Chat');
    expect(layout).toContain('Chat.client');
    expect(layout).toContain('Preview');
    expect(layout).toContain('TerminalTabs');
    expect(layout).toContain('PanelGroup');
    expect(layout).toContain('hideWorkbench');
    expect(layout).toContain('hideMenu');
    // Should NOT have code editor
    expect(layout).not.toContain('CodeMirrorEditor');
    expect(layout).not.toContain('EditorPanel');
    // Should NOT reference deleted ChatPanel
    expect(layout).not.toContain('ChatPanel');
  });

  it('BaseChat should support hideWorkbench prop', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const baseChat = fs.readFileSync(
      path.resolve(__dirname, '../components/chat/BaseChat.tsx'), 'utf-8'
    );

    expect(baseChat).toContain('hideWorkbench');
    expect(baseChat).toContain('hideMenu');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. NIM Client Integration Tests
// ═══════════════════════════════════════════════════════════════════

describe('NIM Client Exports', () => {
  it('should export all core functions', async () => {
    const mod = await import('@/lib/nim-client');
    expect(mod.nimChat).toBeDefined();
    expect(mod.nimChatJSON).toBeDefined();
    expect(mod.nimChatStream).toBeDefined();
    expect(mod.nimVision).toBeDefined();
    expect(mod.nimCallWithRetry).toBeDefined();
    expect(mod.getNimClient).toBeDefined();
  });

  it('should export MODELS registry with all agent roles', async () => {
    const mod = await import('@/lib/nim-client');
    expect(mod.MODELS.BUILDER).toBeDefined();
    expect(mod.MODELS.PLANNER).toBeDefined();
    expect(mod.MODELS.FIX_ROUTER).toBeDefined();
    expect(mod.MODELS.VERIFIER).toBeDefined();
    expect(mod.MODELS.PROPOSER).toBeDefined();
    expect(mod.MODELS.OBSERVER_VISUAL).toBeDefined();
    expect(mod.MODELS.AUTO_DREAM).toBeDefined();
    expect(mod.MODELS.TESTER).toBeDefined();
    expect(mod.MODELS.INTENT).toBeDefined();
  });

  it('FALLBACK_MODEL should be defined', async () => {
    const mod = await import('@/lib/nim-client');
    expect(mod.FALLBACK_MODEL).toBeDefined();
    expect(mod.FALLBACK_MODEL.id).toBe('minimaxai/minimax-m3');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. Persistence Layer Tests
// ═══════════════════════════════════════════════════════════════════

describe('Persistence Layer', () => {
  it('db.ts should exist', async () => {
    const fs = await import('fs');
    const path = await import('path');
    expect(fs.existsSync(path.resolve(__dirname, '../persistence/db.ts'))).toBe(true);
  });

  it('useChatHistory hook should exist', async () => {
    const fs = await import('fs');
    const path = await import('path');
    expect(fs.existsSync(path.resolve(__dirname, '../persistence/useChatHistory.ts'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 9. Store Tests
// ═══════════════════════════════════════════════════════════════════

describe('Workbench Stores', () => {
  const storeFiles = [
    'workbench', 'chat', 'editor', 'files', 'logs',
    'settings', 'theme', 'streaming', 'previews',
  ];

  storeFiles.forEach(store => {
    it(`${store} store should exist`, async () => {
      const fs = await import('fs');
      const path = await import('path');
      expect(fs.existsSync(path.resolve(__dirname, `../stores/${store}.ts`))).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 10. Component Files Tests
// ═══════════════════════════════════════════════════════════════════

describe('Key Workbench Components', () => {
  const components = [
    ['chat/Chat.client.tsx', 'Chat'],
    ['chat/BaseChat.tsx', 'BaseChat'],
    ['chat/Messages.client.tsx', 'Messages'],
    ['workbench/Workbench.client.tsx', 'Workbench'],
    ['workbench/EditorPanel.tsx', 'EditorPanel'],
    ['workbench/Preview.tsx', 'Preview'],
    ['workbench/WorkbenchLayout.tsx', 'WorkbenchLayout'],
    ['sidebar/Menu.client.tsx', 'Menu'],
    ['@settings/tabs/providers/cloud/CloudProvidersTab.tsx', 'CloudProvidersTab'],
  ];

  components.forEach(([file, name]) => {
    it(`${name} component should exist`, async () => {
      const fs = await import('fs');
      const path = await import('path');
      expect(fs.existsSync(path.resolve(__dirname, `../components/${file}`))).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 11. Chat API Wiring Tests
// ═══════════════════════════════════════════════════════════════════

describe('Chat API Wiring', () => {
  it('chat route should export POST handler', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const route = fs.readFileSync(
      path.resolve(__dirname, '../../../app/api/workbench/chat/route.ts'),
      'utf-8'
    );

    expect(route).toContain('export async function POST');
    expect(route).toContain('streamText');
    // AI SDK v6: the route must emit a UI message stream (not the removed
    // toDataStreamResponse, nor plain-text toTextStreamResponse).
    expect(route).toContain('toUIMessageStreamResponse');
  });

  it('Chat.client.tsx should use correct API endpoint', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const chat = fs.readFileSync(
      path.resolve(__dirname, '../components/chat/Chat.client.tsx'),
      'utf-8'
    );

    // Should use useChat hook from AI SDK
    expect(chat).toContain('useChat');
    // Should point to workbench API
    expect(chat).toContain('/api/workbench/chat');
  });

  it('Chat.client.tsx should support hideWorkbench prop', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const chat = fs.readFileSync(
      path.resolve(__dirname, '../components/chat/Chat.client.tsx'),
      'utf-8'
    );

    expect(chat).toContain('hideWorkbench');
    expect(chat).toContain('hideMenu');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 12. Provider-Constants Server Safety Tests
// ═══════════════════════════════════════════════════════════════════

describe('Provider Constants (Server-Safe)', () => {
  it('provider-constants.ts should exist and export LOCAL_PROVIDERS', async () => {
    const mod = await import('@/lib/workbench/stores/provider-constants');
    expect(mod.LOCAL_PROVIDERS).toBeDefined();
    expect(Array.isArray(mod.LOCAL_PROVIDERS)).toBe(true);
    expect(mod.LOCAL_PROVIDERS).toContain('Ollama');
  });

  it('configured-providers route should import from provider-constants (not settings)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const route = fs.readFileSync(
      path.resolve(__dirname, '../../../app/api/workbench/configured-providers/route.ts'),
      'utf-8'
    );

    expect(route).toContain('provider-constants');
    expect(route).not.toContain("from '@/lib/workbench/stores/settings'");
  });
});
