'use client';

// ClientOnly — Next.js replacement for Remix's ClientOnly
// Since workbench pages use dynamic({ ssr: false }), this simply renders children.
// Provides the same API as Remix's ClientOnly for zero-friction porting.

import { useState, useEffect, type ReactNode } from 'react';

interface ClientOnlyProps {
  children: ReactNode | (() => ReactNode);
  fallback?: ReactNode;
}

export function ClientOnly({ children, fallback }: ClientOnlyProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return fallback ?? null;
  }

  return typeof children === 'function' ? children() : children;
}

export default ClientOnly;
