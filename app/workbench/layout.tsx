// /workbench route layout — client component for ToastContainer
// Applies COOP/COEP-compatible headers via next.config.mjs (not here)

'use client';

import { useEffect } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function WorkbenchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Set dark theme on mount — ensures bolt CSS vars use the dark palette
  useEffect(() => {
    const html = document.documentElement;
    const savedTheme = localStorage.getItem('bolt_theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);

    // Also add 'dark' class for Tailwind dark: variants
    if (savedTheme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, []);

  return (
    <div
      className="workbench-layout bg-bolt-elements-bg-depth-1"
      data-theme="dark"
      style={{
        height: '100dvh',
        width: '100%',
        maxWidth: '100vw',
        minWidth: 0,
        overflow: 'hidden',
        position: 'relative',
        isolation: 'isolate',
        contain: 'layout paint',
      }}
    >
      {children}
      <ToastContainer
        position="bottom-right"
        theme="dark"
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        toastClassName="!bg-bolt-elements-bg-depth-2 !text-bolt-elements-textPrimary !border !border-bolt-elements-borderColor !rounded-xl !shadow-lg"
      />
    </div>
  );
}
