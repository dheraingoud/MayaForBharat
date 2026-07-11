'use client'

import { ReactNode, createContext, useContext, useState, useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import { ClerkProvider } from '@clerk/nextjs'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || 'https://example.check.convex.cloud'

// Lazy-initialize on first client access. Instantiating at module-evaluation
// time triggered Next.js's `workStore to be initialized` invariant during
// the root-layout prerender pass.
let _convex: ConvexReactClient | null = null
function getConvexClient(): ConvexReactClient {
  if (!_convex) _convex = new ConvexReactClient(convexUrl)
  return _convex
}

export type Language = 'hi' | 'en'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}

function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('hi')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('maya-language') as Language
    if (saved && (saved === 'hi' || saved === 'en')) {
      setLanguage(saved)
    }
  }, [])

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang)
    localStorage.setItem('maya-language', lang)
  }

  if (!mounted) {
    return (
      <LanguageContext.Provider value={{ language: 'hi', setLanguage: () => {} }}>
        {children}
      </LanguageContext.Provider>
    )
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleLanguageChange }}>
      {children}
    </LanguageContext.Provider>
  )
}

function InnerProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <LanguageProvider>
        {children}
        <ToastContainer
          position="bottom-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="dark"
          toastStyle={{
            background: '#222120',
            color: '#F5F4F0',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            fontSize: '13px',
          }}
        />
      </LanguageProvider>
    </ThemeProvider>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  const hasClerkKey = clerkKey && clerkKey.trim().length > 0 && !clerkKey.startsWith('pk_test_disable')

  // Always wrap with ClerkProvider when a real key is present.
  // SignIn/SignUp components require the provider context.
  const inner = (
    <ConvexProvider client={getConvexClient()}>
      <InnerProviders>{children}</InnerProviders>
    </ConvexProvider>
  )

  if (!hasClerkKey) {
    return inner
  }

  return (
    <ClerkProvider
      publishableKey={clerkKey}
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: '#E8601A',
          borderRadius: '1rem',
        },
      }}
    >
      {inner}
    </ClerkProvider>
  )
}
