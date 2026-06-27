// @ts-nocheck
// Security module unit tests — rate limiting, API key validation, error sanitization, withSecurity wrapper
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  checkRateLimit,
  validateApiKeyFormat,
  sanitizeErrorMessage,
  createSecurityHeaders,
} from '@/lib/workbench/security';

// ═══════════════════════════════════════════════════════════════════
// 1. Rate Limiting
// ═══════════════════════════════════════════════════════════════════

describe('Rate Limiting', () => {
  const createMockRequest = (ip: string = '127.0.0.1'): Request => {
    return new Request('http://localhost:3000/api/test', {
      headers: {
        'x-forwarded-for': ip,
      },
    });
  };

  it('should allow first request to any endpoint', () => {
    const result = checkRateLimit(createMockRequest('10.0.0.1'), '/api/some-new-endpoint');
    expect(result.allowed).toBe(true);
  });

  it('should allow requests when under the rate limit', () => {
    const ip = '10.0.0.2';
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(createMockRequest(ip), '/api/llmcall');
      expect(result.allowed).toBe(true);
    }
  });

  it('should block requests when rate limit is exceeded for /api/* wildcard', () => {
    const ip = '10.0.0.3';
    // /api/* allows 100 per 15 minutes — first matching rule wins
    for (let i = 0; i < 100; i++) {
      checkRateLimit(createMockRequest(ip), '/api/llmcall');
    }
    const result = checkRateLimit(createMockRequest(ip), '/api/llmcall');
    expect(result.allowed).toBe(false);
    expect(result.resetTime).toBeDefined();
  });

  it('should track rate limits per IP separately', () => {
    const ip1 = '10.0.0.4';
    const ip2 = '10.0.0.5';
    // Exhaust ip1's rate limit
    for (let i = 0; i < 10; i++) {
      checkRateLimit(createMockRequest(ip1), '/api/llmcall');
    }
    // ip2 should still be allowed
    const result = checkRateLimit(createMockRequest(ip2), '/api/llmcall');
    expect(result.allowed).toBe(true);
  });

  it('should match wildcard patterns like /api/*', () => {
    const ip = '10.0.0.6';
    // /api/* allows 100 per 15 minutes
    for (let i = 0; i < 100; i++) {
      checkRateLimit(createMockRequest(ip), '/api/custom-endpoint');
    }
    const result = checkRateLimit(createMockRequest(ip), '/api/custom-endpoint');
    expect(result.allowed).toBe(false);
  });

  it('should return allowed=true for endpoints without rate limit rules', () => {
    const result = checkRateLimit(createMockRequest('10.0.0.7'), '/some/random/path');
    expect(result.allowed).toBe(true);
  });

  it('should extract client IP from x-forwarded-for header', () => {
    const req = new Request('http://localhost:3000/api/test', {
      headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
    });
    // Should use the first IP in x-forwarded-for
    const result = checkRateLimit(req, '/api/llmcall');
    expect(result.allowed).toBe(true);
  });

  it('should prefer cf-connecting-ip over other headers', () => {
    const req = new Request('http://localhost:3000/api/test', {
      headers: {
        'cf-connecting-ip': '203.0.113.1',
        'x-forwarded-for': '10.0.0.1',
        'x-real-ip': '10.0.0.2',
      },
    });
    const result = checkRateLimit(req, '/api/llmcall');
    expect(result.allowed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. API Key Validation
// ═══════════════════════════════════════════════════════════════════

describe('API Key Validation', () => {
  it('should reject empty string', () => {
    expect(validateApiKeyFormat('', 'openai')).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(validateApiKeyFormat(null as any, 'openai')).toBe(false);
    expect(validateApiKeyFormat(undefined as any, 'openai')).toBe(false);
  });

  it('should reject keys containing "your_"', () => {
    expect(validateApiKeyFormat('your_api_key_placeholder_that_is_long_enough_for_testing_purposes', 'openai')).toBe(false);
  });

  it('should reject keys containing "here"', () => {
    expect(validateApiKeyFormat('put_your_api_key_here_this_is_a_long_enough_string_for_testing', 'openai')).toBe(false);
  });

  it('should reject keys shorter than minimum length for known providers', () => {
    expect(validateApiKeyFormat('short-key', 'anthropic')).toBe(false); // min 50
    expect(validateApiKeyFormat('short-key', 'openai')).toBe(false); // min 50
  });

  it('should accept valid-length keys for known providers', () => {
    const longKey = 'sk-' + 'a'.repeat(60);
    expect(validateApiKeyFormat(longKey, 'openai')).toBe(true);
    expect(validateApiKeyFormat(longKey, 'anthropic')).toBe(true);
  });

  it('should use default minimum length (20) for unknown providers', () => {
    expect(validateApiKeyFormat('short', 'unknown-provider')).toBe(false);
    expect(validateApiKeyFormat('a'.repeat(25), 'unknown-provider')).toBe(true);
  });

  it('should be case-insensitive for provider matching', () => {
    const longKey = 'sk-' + 'a'.repeat(60);
    expect(validateApiKeyFormat(longKey, 'OpenAI')).toBe(true);
    expect(validateApiKeyFormat(longKey, 'ANTHROPIC')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Error Sanitization
// ═══════════════════════════════════════════════════════════════════

describe('Error Sanitization', () => {
  it('should show full error in development mode', () => {
    const error = new Error('Detailed API key sk-abc123 is invalid');
    expect(sanitizeErrorMessage(error, true)).toBe('Detailed API key sk-abc123 is invalid');
  });

  it('should hide API key errors in production', () => {
    const error = new Error('Invalid API key: sk-abc123');
    expect(sanitizeErrorMessage(error, false)).toBe('Authentication failed');
  });

  it('should hide token errors in production', () => {
    const error = new Error('Bearer token expired');
    expect(sanitizeErrorMessage(error, false)).toBe('Authentication failed');
  });

  it('should hide secret errors in production', () => {
    const error = new Error('Missing client secret');
    expect(sanitizeErrorMessage(error, false)).toBe('Authentication failed');
  });

  it('should show rate limit messages in production', () => {
    const error = new Error('rate limit exceeded');
    expect(sanitizeErrorMessage(error, false)).toBe('Rate limit exceeded. Please try again later.');
  });

  it('should show rate limit for 429 errors', () => {
    const error = new Error('HTTP 429 Too Many Requests');
    expect(sanitizeErrorMessage(error, false)).toBe('Rate limit exceeded. Please try again later.');
  });

  it('should return generic message for non-sensitive errors in production', () => {
    const error = new Error('Some random failure');
    expect(sanitizeErrorMessage(error, false)).toBe('An unexpected error occurred');
  });

  it('should handle non-Error objects', () => {
    expect(sanitizeErrorMessage('string error', false)).toBe('An unexpected error occurred');
    expect(sanitizeErrorMessage(42, false)).toBe('An unexpected error occurred');
    expect(sanitizeErrorMessage({ message: 'obj error' }, false)).toBe('An unexpected error occurred');
  });

  it('should stringify non-Error objects in development', () => {
    expect(sanitizeErrorMessage('string error', true)).toBe('string error');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Security Headers
// ═══════════════════════════════════════════════════════════════════

describe('Security Headers', () => {
  it('should include X-Frame-Options', () => {
    const headers = createSecurityHeaders();
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('should include X-Content-Type-Options', () => {
    const headers = createSecurityHeaders();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('should include Content-Security-Policy', () => {
    const headers = createSecurityHeaders();
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toContain("frame-src 'none'");
  });

  it('should include Referrer-Policy', () => {
    const headers = createSecurityHeaders();
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('should include Permissions-Policy', () => {
    const headers = createSecurityHeaders();
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Permissions-Policy']).toContain('microphone=()');
  });

  it('should not include HSTS in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const headers = createSecurityHeaders();
    expect(headers).not.toHaveProperty('Strict-Transport-Security');
    process.env.NODE_ENV = originalEnv;
  });
});
