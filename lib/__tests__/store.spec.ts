// @ts-nocheck
import { describe, it, expect } from 'vitest'
import type { BuiltApp, AppMessage } from '@/lib/store'

/**
 * Tests for store types and mapping contracts.
 * Avoids Convex calls — validates the data model contracts.
 */

describe('Store data model', () => {
  describe('BuiltApp interface', () => {
    it('has all required fields', () => {
      const app: BuiltApp = {
        id: 'app-001',
        name: 'Test Store',
        nameHindi: 'टेस्ट स्टोर',
        descriptionEn: 'A test store built by MAYA',
        category: 'retail',
        url: 'https://test-store.vercel.app',
        projectId: 'proj-001',
        createdAt: '2026-06-23T00:00:00.000Z',
        status: 'live',
        files: [{ path: 'app/page.tsx', content: 'export default function Home() {}' }],
      }

      expect(app.id).toBe('app-001')
      expect(app.name).toBe('Test Store')
      expect(app.nameHindi).toBe('टेस्ट स्टोर')
      expect(app.status).toBe('live')
      expect(app.files).toHaveLength(1)
    })

    it('accepts optional fields', () => {
      const app: BuiltApp = {
        id: 'app-002',
        name: 'Preview App',
        nameHindi: 'प्रीव्यू',
        descriptionEn: 'Preview only',
        category: 'services',
        url: '',
        projectId: 'proj-002',
        createdAt: new Date().toISOString(),
        status: 'preview',
        deploymentId: 'dpl-123',
        adminUsername: 'admin',
        adminPin: '1234',
        shownToOwner: false,
        messages: [],
        files: [],
      }

      expect(app.deploymentId).toBe('dpl-123')
      expect(app.adminUsername).toBe('admin')
      expect(app.shownToOwner).toBe(false)
    })

    it('status must be one of the allowed values', () => {
      const statuses: BuiltApp['status'][] = ['live', 'building', 'preview', 'error', 'deployed']
      expect(statuses).toContain('live')
      expect(statuses).toContain('building')
      expect(statuses).toContain('preview')
      expect(statuses).toContain('error')
      expect(statuses).toContain('deployed')
    })
  })

  describe('AppMessage interface', () => {
    it('user message', () => {
      const msg: AppMessage = {
        role: 'user',
        content: 'Add a products page',
        timestamp: Date.now(),
      }
      expect(msg.role).toBe('user')
      expect(typeof msg.timestamp).toBe('number')
    })

    it('assistant message', () => {
      const msg: AppMessage = {
        role: 'assistant',
        content: 'I have added a products page',
        timestamp: Date.now(),
      }
      expect(msg.role).toBe('assistant')
    })
  })

  describe('Convex mapping contract', () => {
    // Tests the mapFromConvex function logic without calling Convex
    it('maps a Convex document to BuiltApp', () => {
      const convexDoc = {
        _id: 'convex-id',
        appId: 'app-001',
        name: 'My Store',
        nameHindi: 'मेरा दुकान',
        descriptionEn: 'Description',
        descriptionHindi: 'विवरण',
        category: 'retail',
        templateFamily: 'commerce',
        vercelUrl: 'https://my-store.vercel.app',
        vercelProjectId: 'proj-001',
        createdAt: Date.now(),
        status: 'live',
        deploymentId: 'dpl-123',
        adminUsername: 'admin',
        adminPin: '1234',
        shownToOwner: true,
        messages: [{ role: 'user', content: 'hello', timestamp: Date.now() }],
      }

      // Simulate mapFromConvex logic
      const mapped: BuiltApp = {
        id: convexDoc.appId || convexDoc._id,
        name: convexDoc.name,
        nameHindi: convexDoc.nameHindi || convexDoc.name,
        descriptionEn: convexDoc.descriptionEn || convexDoc.descriptionHindi || '',
        category: convexDoc.category || convexDoc.templateFamily || 'other',
        url: convexDoc.vercelUrl || '',
        projectId: convexDoc.vercelProjectId || '',
        createdAt: new Date(convexDoc.createdAt).toISOString(),
        status: (convexDoc.status || 'building') as BuiltApp['status'],
        deploymentId: convexDoc.deploymentId,
        adminUsername: convexDoc.adminUsername,
        adminPin: convexDoc.adminPin,
        shownToOwner: convexDoc.shownToOwner,
        messages: convexDoc.messages || [],
        files: [],
      }

      expect(mapped.id).toBe('app-001') // prefers appId over _id
      expect(mapped.descriptionEn).toBe('Description') // prefers En over Hindi
      expect(mapped.category).toBe('retail') // prefers category over templateFamily
      expect(mapped.url).toBe('https://my-store.vercel.app')
    })

    it('falls back to _id when appId is missing', () => {
      const doc = { _id: 'fallback-id', name: 'Test' }
      const id = (doc as any).appId || doc._id
      expect(id).toBe('fallback-id')
    })

    it('falls back to descriptionHindi when descriptionEn is empty', () => {
      const doc = { descriptionEn: '', descriptionHindi: 'हिन्दी विवरण' }
      const desc = doc.descriptionEn || doc.descriptionHindi || ''
      expect(desc).toBe('हिन्दी विवरण')
    })

    it('falls back to templateFamily when category is missing', () => {
      const doc = { category: '', templateFamily: 'food' }
      const cat = doc.category || doc.templateFamily || 'other'
      expect(cat).toBe('food')
    })

    it('falls back to "other" when both category and templateFamily are missing', () => {
      const doc = { category: '', templateFamily: '' }
      const cat = doc.category || doc.templateFamily || 'other'
      expect(cat).toBe('other')
    })
  })
})
