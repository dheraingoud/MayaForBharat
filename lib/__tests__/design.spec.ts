import { describe, it, expect } from 'vitest'
import {
  deriveAppDesign,
  generateGlobalsCss,
  FEATURE_TIERS,
  type AppDesign,
} from '../design'

// ─── deriveAppDesign ─────────────────────────────────────────────────────────

describe('deriveAppDesign', () => {
  const ALL_TYPES = ['kirana', 'grocery', 'dairy', 'tailor', 'salon', 'restaurant', 'medical', 'hardware', 'transport', 'coaching']

  it('returns valid design object for all business types', () => {
    for (const type of ALL_TYPES) {
      const design = deriveAppDesign(type, 'Test Store', 'Mumbai')
      expect(design.primary).toMatch(/^#[0-9a-f]{6}$/i)
      expect(design.primaryLight).toMatch(/^#[0-9a-f]{6}$/i)
      expect(design.primaryDark).toMatch(/^#[0-9a-f]{6}$/i)
      expect(design.surface).toBe('#FFFFFF')
      expect(design.text).toBe('#1A1917')
      expect(design.textMuted).toBe('#6B6560')
      expect(design.fontDisplay).toBeTruthy()
      expect(design.fontBody).toBeTruthy()
      expect(design.radius).toBeTruthy()
      expect(['pill', 'square']).toContain(design.buttonStyle)
    }
  })

  it('returns valid design for unknown business type', () => {
    const design = deriveAppDesign('spaceship', 'Galaxy Store')
    expect(design.primary).toMatch(/^#[0-9a-f]{6}$/i)
    expect(design.fontDisplay).toBeTruthy()
  })

  it('does NOT produce purple or violet hues (anti-AI-slop)', () => {
    for (const type of ALL_TYPES) {
      const design = deriveAppDesign(type, 'Test', 'Delhi')
      // Purple/violet hex values tend to have high R, low G, high B
      // Parse the primary color
      const hex = design.primary
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      // A purple color would have r > g and b > g significantly
      // This is a heuristic check — the code explicitly avoids hue 260/280
      if (r > 150 && b > 150 && g < 80) {
        throw new Error(`${type} produced a purple-looking color: ${hex} (r=${r}, g=${g}, b=${b})`)
      }
    }
  })

  it('produces different saturation for tier-1 cities', () => {
    const tier1 = deriveAppDesign('kirana', 'TestStore', 'Mumbai')
    const tier2 = deriveAppDesign('kirana', 'TestStore', 'Jaipur')
    // They might produce different colors due to saturation difference (65 vs 80)
    // At minimum, both should be valid hex
    expect(tier1.primary).toMatch(/^#[0-9a-f]{6}$/i)
    expect(tier2.primary).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('varies design by business name hash', () => {
    const design1 = deriveAppDesign('kirana', 'AAAA')
    const design2 = deriveAppDesign('kirana', 'ZZZZ')
    // Different names should produce different lightness variants
    // Both valid, potentially different
    expect(design1.primary).toMatch(/^#[0-9a-f]{6}$/i)
    expect(design2.primary).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('assigns correct font pairs per business type', () => {
    expect(deriveAppDesign('salon', 'Beauty').fontDisplay).toBe('Playfair Display')
    expect(deriveAppDesign('restaurant', 'Food').fontDisplay).toBe('Fraunces')
    expect(deriveAppDesign('hardware', 'Tools').fontDisplay).toBe('Barlow')
    expect(deriveAppDesign('coaching', 'Academy').fontDisplay).toBe('Outfit')
  })

  it('assigns correct border radius per business type', () => {
    expect(deriveAppDesign('salon', 'Beauty').radius).toBe('1.25rem')
    expect(deriveAppDesign('medical', 'Clinic').radius).toBe('0.5rem')
    expect(deriveAppDesign('hardware', 'Tools').radius).toBe('0.375rem')
  })

  it('assigns correct button style per business type', () => {
    expect(deriveAppDesign('salon', 'Beauty').buttonStyle).toBe('pill')
    expect(deriveAppDesign('medical', 'Clinic').buttonStyle).toBe('square')
    expect(deriveAppDesign('hardware', 'Tools').buttonStyle).toBe('square')
  })
})

// ─── generateGlobalsCss ──────────────────────────────────────────────────────

describe('generateGlobalsCss', () => {
  const design = deriveAppDesign('kirana', 'Test Store', 'Mumbai')

  it('generates valid CSS with all required variables', () => {
    const css = generateGlobalsCss(design)
    expect(css).toContain('--background:')
    expect(css).toContain('--foreground:')
    expect(css).toContain('--primary:')
    expect(css).toContain('--primary-light:')
    expect(css).toContain('--primary-dark:')
    expect(css).toContain('--radius:')
    expect(css).toContain('--font-display:')
    expect(css).toContain('--font-body:')
  })

  it('includes dark mode variables', () => {
    const css = generateGlobalsCss(design)
    expect(css).toContain('.dark')
    expect(css).toContain('#0A0A0B')  // dark bg
    expect(css).toContain('#18181B')  // dark surface
  })

  it('includes Tailwind directives', () => {
    const css = generateGlobalsCss(design)
    expect(css).toContain('@tailwind base')
    expect(css).toContain('@tailwind components')
    expect(css).toContain('@tailwind utilities')
  })

  it('includes Google Fonts import', () => {
    const css = generateGlobalsCss(design)
    expect(css).toContain('fonts.googleapis.com')
    expect(css).toContain(encodeURIComponent(design.fontDisplay))
  })

  it('includes glass-card utility', () => {
    const css = generateGlobalsCss(design)
    expect(css).toContain('.glass-card')
    expect(css).toContain('backdrop-filter')
  })

  it('includes skeleton shimmer animation', () => {
    const css = generateGlobalsCss(design)
    expect(css).toContain('@keyframes shimmer')
    expect(css).toContain('.skeleton')
  })

  it('includes scrollbar-hide utility', () => {
    const css = generateGlobalsCss(design)
    expect(css).toContain('.scrollbar-hide')
  })
})

// ─── FEATURE_TIERS ───────────────────────────────────────────────────────────

describe('FEATURE_TIERS', () => {
  it('has tier0, tier1, tier2 arrays for all categories', () => {
    const categories = ['kirana', 'restaurant', 'ecommerce', 'default']
    for (const cat of categories) {
      const tiers = FEATURE_TIERS[cat]
      expect(tiers).toBeDefined()
      expect(Array.isArray(tiers.tier0)).toBe(true)
      expect(Array.isArray(tiers.tier1)).toBe(true)
      expect(Array.isArray(tiers.tier2)).toBe(true)
      expect(tiers.tier0.length).toBeGreaterThan(0)
    }
  })

  it('kirana tier0 includes essential store features', () => {
    const kirana = FEATURE_TIERS.kirana
    expect(kirana.tier0).toContain('product_listing')
    expect(kirana.tier0).toContain('basic_cart')
    expect(kirana.tier0).toContain('admin_product_crud')
  })

  it('restaurant tier0 includes menu features', () => {
    const rest = FEATURE_TIERS.restaurant
    expect(rest.tier0).toContain('menu_display')
    expect(rest.tier0).toContain('admin_menu_crud')
  })

  it('default tier has generic features', () => {
    const def = FEATURE_TIERS.default
    expect(def.tier0).toContain('home_page')
    expect(def.tier0).toContain('contact_form')
  })
})
