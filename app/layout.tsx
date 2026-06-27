import type { Metadata, Viewport } from 'next'
import { Outfit, DM_Sans, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Providers } from './providers'
import { validateEnv } from '@/lib/env'
import './globals.css'

// Validate env vars once at startup
validateEnv()

// Premium display font — Outfit is a geometric grotesk approved by design guidelines
const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
})

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '700'],
})

const jetBrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: {
    default: 'MAYA — Build Apps by Speaking',
    template: '%s | MAYA',
  },
  description: 'Describe your business in Hindi or English. MAYA builds, deploys, and evolves your app overnight. Voice-first AI app builder for Indian businesses.',
  keywords: ['AI app builder', 'voice to app', 'Hindi app builder', 'MAYA', 'no-code', 'Indian business', 'kirana app', 'restaurant app'],
  authors: [{ name: 'MAYA AI' }],
  creator: 'MAYA',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://maya-app.vercel.app'),
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: 'MAYA',
    title: 'MAYA — Build Apps by Speaking',
    description: 'Describe your business in Hindi or English. MAYA builds, deploys, and evolves your app overnight.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MAYA — Build Apps by Speaking',
    description: 'Voice-first AI app builder for Indian businesses.',
    creator: '@maya_ai',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F4F0' },
    { media: '(prefers-color-scheme: dark)', color: '#1A1917' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-theme="dark" className="dark" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${dmSans.variable} ${jetBrainsMono.variable} antialiased`}
        style={{ '--font-sora': 'var(--font-outfit)' } as React.CSSProperties}
      >
        <Providers>{children}</Providers>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
