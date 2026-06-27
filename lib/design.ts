export interface AppDesign {
  primary: string
  primaryLight: string
  primaryDark: string
  surface: string
  bg: string
  text: string
  textMuted: string
  border: string
  fontDisplay: string
  fontBody: string
  radius: string
  buttonStyle: 'pill' | 'square'
}

/**
 * Converts HSL to Hex (simplified for UI tokens)
 */
function hslToHex(h: number, s: number, l: number): string {
  l /= 100
  const a = (s * Math.min(l, 1 - l)) / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function deriveAppDesign(businessType: string, businessName: string, city: string = ''): AppDesign {
  // Step 1: Pick base hue from business type
  // NOTE: No purple (280) or violet (260) — these are "AI slop" colors
  const BASE_HUES: Record<string, number> = {
    kirana: 28, // warm amber
    grocery: 28,
    dairy: 200, // clean blue
    tailor: 350, // warm rose (not purple!)
    salon: 340, // rose
    restaurant: 16, // deep orange-red
    medical: 175, // teal-green
    hardware: 35, // brown-orange
    transport: 215, // navy
    coaching: 210, // trustworthy blue (not violet!)
    default: 170, // modern teal
  }

  // Step 2: Derive saturation from city tier
  const TIER1 = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata']
  const saturation = TIER1.includes(city) ? 65 : 80

  // Step 3: Pick lightness variation based on business name hash
  const nameHash = businessName.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const lightnessVariant = [45, 50, 55, 48, 52][nameHash % 5]

  const hue = BASE_HUES[businessType.toLowerCase()] ?? BASE_HUES.default

  // Typography pair
  const FONT_PAIRS: Record<string, { display: string; body: string }> = {
    kirana: { display: 'Sora', body: 'DM Sans' },
    dairy: { display: 'Plus Jakarta Sans', body: 'Inter' },
    salon: { display: 'Playfair Display', body: 'Lato' },
    restaurant: { display: 'Fraunces', body: 'Source Sans 3' },
    medical: { display: 'Plus Jakarta Sans', body: 'Inter' },
    hardware: { display: 'Barlow', body: 'DM Sans' },
    transport: { display: 'Space Grotesk', body: 'Inter' },
    coaching: { display: 'Outfit', body: 'DM Sans' },
    tailor: { display: 'Cormorant Garamond', body: 'Lato' },
    default: { display: 'Inter', body: 'DM Sans' },
  }
  const fonts = FONT_PAIRS[businessType.toLowerCase()] ?? FONT_PAIRS.default

  const RADIUS_MAP: Record<string, string> = {
    salon: '1.25rem',
    medical: '0.5rem',
    hardware: '0.375rem',
    kirana: '0.75rem',
    restaurant: '1rem',
    default: '0.75rem',
  }

  const BUTTON_STYLES: Record<string, 'pill' | 'square'> = {
    salon: 'pill',
    medical: 'square',
    hardware: 'square',
    kirana: 'pill',
    restaurant: 'pill',
    default: 'pill',
  }

  return {
    primary: hslToHex(hue, saturation, lightnessVariant),
    primaryLight: hslToHex(hue, saturation, lightnessVariant + 45),
    primaryDark: hslToHex(hue, saturation, Math.max(lightnessVariant - 15, 10)),
    surface: '#FFFFFF',
    bg: hslToHex(hue, 20, 97), // very light tint
    text: '#1A1917',
    textMuted: '#6B6560',
    border: hslToHex(hue, 30, 90),
    fontDisplay: fonts.display,
    fontBody: fonts.body,
    radius: RADIUS_MAP[businessType.toLowerCase()] ?? RADIUS_MAP.default,
    buttonStyle: BUTTON_STYLES[businessType.toLowerCase()] ?? BUTTON_STYLES.default,
  }
}

export function generateGlobalsCss(design: AppDesign): string {
  // Compute dark mode variants from the primary hue
  const darkBg = '#0A0A0B'
  const darkSurface = '#18181B'
  const darkText = '#FAFAF9'
  const darkTextMuted = '#A1A1AA'
  const darkBorder = '#27272A'

  return `
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ── MAYA Design System (auto-generated) ── */
@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(design.fontDisplay)}:wght@400;500;600;700;800;900&family=${encodeURIComponent(design.fontBody)}:wght@300;400;500;600&display=swap');

@layer base {
  :root {
    --background: ${design.bg};
    --foreground: ${design.text};
    --card: ${design.surface};
    --card-foreground: ${design.text};
    --primary: ${design.primary};
    --primary-light: ${design.primaryLight};
    --primary-dark: ${design.primaryDark};
    --primary-foreground: #FFFFFF;
    --secondary: ${design.bg};
    --secondary-foreground: ${design.text};
    --muted: ${design.bg};
    --muted-foreground: ${design.textMuted};
    --accent: ${design.primaryLight};
    --accent-foreground: ${design.text};
    --destructive: #EF4444;
    --destructive-foreground: #FFFFFF;
    --border: ${design.border};
    --input: ${design.border};
    --ring: ${design.primary};
    --radius: ${design.radius};
    --font-display: '${design.fontDisplay}', system-ui, sans-serif;
    --font-body: '${design.fontBody}', system-ui, sans-serif;
  }

  .dark {
    --background: ${darkBg};
    --foreground: ${darkText};
    --card: ${darkSurface};
    --card-foreground: ${darkText};
    --primary: ${design.primary};
    --primary-foreground: #FFFFFF;
    --secondary: ${darkSurface};
    --secondary-foreground: ${darkText};
    --muted: #27272A;
    --muted-foreground: ${darkTextMuted};
    --accent: ${design.primaryDark};
    --accent-foreground: ${darkText};
    --destructive: #DC2626;
    --destructive-foreground: #FFFFFF;
    --border: ${darkBorder};
    --input: ${darkBorder};
    --ring: ${design.primary};
  }
}

/* ── Base Styles ── */
* { border-color: var(--border); }

body {
  background-color: var(--background);
  color: var(--foreground);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-display);
  letter-spacing: -0.025em;
}

/* ── Glass Card ── */
.glass-card {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.dark .glass-card {
  background: rgba(24, 24, 27, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

/* ── Skeleton Shimmer ── */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--muted) 25%, var(--muted-foreground) 37%, var(--muted) 63%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius);
}

/* ── Scrollbar ── */
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
`
}

export const FEATURE_TIERS: Record<string, { tier0: string[]; tier1: string[]; tier2: string[] }> = {
  kirana: {
    tier0: [
      'product_listing',
      'product_detail',
      'basic_cart',
      'simple_checkout',
      'order_confirmation',
      'admin_product_crud',
      'admin_order_view',
    ],
    tier1: ['product_search', 'product_categories', 'order_tracking_status'],
    tier2: ['product_variants', 'discount_codes', 'customer_order_history'],
  },
  restaurant: {
    tier0: [
      'menu_display',
      'item_detail',
      'basic_order',
      'order_confirmation',
      'admin_menu_crud',
      'admin_order_board',
    ],
    tier1: ['menu_categories', 'item_customization', 'order_status_tracking'],
    tier2: ['special_items_banner', 'order_history', 'combo_offers'],
  },
  ecommerce: {
    tier0: [
      'product_listing',
      'product_detail',
      'basic_cart',
      'simple_checkout (COD only)',
      'order_confirmation',
      'admin_product_crud',
      'admin_order_view',
    ],
    tier1: ['product_search', 'product_categories', 'order_tracking_status', 'upi_payment'],
    tier2: ['product_variants', 'discount_codes', 'customer_order_history', 'reviews'],
  },
  default: {
    tier0: [
      'home_page',
      'contact_form',
      'services_list',
      'admin_dashboard',
    ],
    tier1: ['photo_gallery', 'testimonials'],
    tier2: ['online_booking'],
  },
}
