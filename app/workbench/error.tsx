'use client';

// Workbench-segment error boundary — caught by Next.js error.tsx convention
// when BuilderPage, WebContainer init, or Convex queries throw in this subtree.
// Sits between BuilderPage crashes (hard, opaque, no UI feedback) and the
// generic app/error.tsx fallback (no builder-specific recovery hint).
//
// Inherits layout.tsx wrapper (Toast, dark theme). reset() re-renders the
// segment by re-mounting [id]/page.tsx, which re-invokes useGenerateJob and
// BuilderPageWithJob.

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function WorkbenchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const appId = (params?.id as string) ?? '';

  useEffect(() => {
    console.error('[Workbench Error]', { appId, digest: error.digest, message: error.message });
  }, [error, appId]);

  return (
    <div className="workbench-layout flex items-center justify-center px-6 bg-[#111110]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center"
      >
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-red-950/40 border border-red-900/50 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-400" strokeWidth={1.5} />
       </div>

        <h1
          className="text-xl font-bold text-[#F5F4F0] mb-2"
          style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}
        >
          Builder crashed
       </h1>
        <p className="text-sm text-[#9E9890] mb-6 leading-relaxed">
          The workbench hit an unexpected error while loading this app. Files
          and your in-progress edits are safe — reloading reattaches them.
       </p>

        {appId && (
          <p className="text-xs text-[#6B6560] font-mono mb-5">
            app: {appId}
            {error.digest ? ` · ${error.digest}` : ''}
         </p>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#E8601A] text-white font-semibold text-sm shadow-lg shadow-[#E8601A]/20 hover:bg-[#C94E12] transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reload Builder
       </motion.button>
     </motion.div>
   </div>
  );
}
