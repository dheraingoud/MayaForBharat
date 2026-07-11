'use client';

/**
 * GitHubSnapshotButton — connect/disconnect + commit+push to GitHub.
 *
 * Sits in the workbench header. Three states:
 *  1. Not connected  → "Connect" button → opens token modal
 *  2. Connected      → "Snapshot" button + green dot + avatar circle
 *  3. Disabled       → while streaming or before WebContainer booted
 */

import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useState } from 'react';
import { Github, Upload, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { useGit } from '@/lib/workbench/hooks/useGit';
import {
  isGitHubConnected,
  githubConnectionStore,
  githubConnectionAtom,
} from '@/lib/workbench/stores/githubConnection';

export function GitHubSnapshotButton() {
  const connected = useStore(isGitHubConnected);
  const connection = useStore(githubConnectionAtom);
  const { ready, gitSnapshot } = useGit();

  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [tokenType, setTokenType] = useState<'classic' | 'fine-grained'>('classic');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // Default the snapshot message to a human-friendly timestamped string
  useEffect(() => {
    if (open && connected && !message) {
      const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
      setMessage(`snapshot ${stamp}`);
    }
  }, [open, connected, message]);

  const onConnect = useCallback(async () => {
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      await githubConnectionStore.connect(token.trim(), tokenType);
      toast.success('Connected to GitHub');
      setToken('');
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`GitHub connect failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }, [token, tokenType, busy]);

  const onSnapshot = useCallback(async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      const out = await gitSnapshot(message.trim());
      toast.success(`Pushed ${out.ref} — ${out.sha.slice(0, 7)}`);
      setMessage('');
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Snapshot failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }, [message, busy, gitSnapshot]);

  const onDisconnect = useCallback(() => {
    githubConnectionStore.disconnect();
    toast.info('Disconnected from GitHub');
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  // Disconnected → small "Connect" link
  if (!connected) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          disabled={!ready}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg ring-1 ring-white/[0.06] text-[#9E9890] hover:text-white hover:bg-white/[0.04] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          title={ready ? 'Connect GitHub to enable snapshots' : 'Booting WebContainer…'}
        >
          <Github className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span className="hidden sm:inline">Connect</span>
       </button>

        {open && <ConnectModal onClose={() => setOpen(false)}>
          <h3 className="text-sm font-semibold text-[#F5F4F0] mb-3" style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}>
            Connect GitHub
         </h3>
          <p className="text-xs text-[#9E9890] mb-3 leading-relaxed">
            Paste a personal access token. Stored in localStorage and used to push snapshots only.
         </p>
          <label className="block text-[10px] uppercase tracking-wider text-[#6B6560] mb-1">Token</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_…  or  github_pat_…"
            className="w-full px-2.5 py-1.5 bg-[#111110] ring-1 ring-white/[0.06] rounded-md text-[12px] text-[#F5F4F0] placeholder:text-[#6B6560] focus:outline-none focus:ring-[#E8601A]/40 mb-2"
            autoFocus
          />
          <div className="flex gap-1 mb-3 text-[10px]">
            {(['classic', 'fine-grained'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTokenType(t)}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  tokenType === t
                    ? 'bg-[#E8601A]/10 text-[#E8601A] ring-1 ring-[#E8601A]/30'
                    : 'bg-white/[0.03] text-[#6B6560] hover:text-[#9E9890]'
                }`}
              >
                {t}
             </button>
            ))}
         </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-[11px] text-[#9E9890] hover:text-white transition-colors"
            >
              Cancel
           </button>
            <button
              onClick={onConnect}
              disabled={!token.trim() || busy}
              className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-[#E8601A] text-white hover:bg-[#FF7A30] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />}
              Connect
           </button>
         </div>
       </ConnectModal>}
      </>
    );
  }

  // Connected: avatar + snapshot button
  const login = connection.user?.login ?? 'gh';
  const avatar = connection.user?.avatar_url ?? '';

  return (
    <>
      <div className="flex items-center gap-1 shrink-0">
        {/* Avatar / status */}
        <div className="relative">
          {avatar ? (
            <img
              src={avatar}
              alt={login}
              className="w-6 h-6 rounded-full ring-1 ring-white/[0.08]"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-[#E8601A]/10 ring-1 ring-[#E8601A]/20 flex items-center justify-center">
              <Github className="w-3 h-3 text-[#E8601A]" strokeWidth={1.8} />
           </div>
          )}
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-[#1A1917]" />
       </div>

        <button
          onClick={() => setOpen(true)}
          disabled={!ready}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-[#E8601A]/10 text-[#E8601A] ring-1 ring-[#E8601A]/20 hover:bg-[#E8601A]/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={ready ? `Snapshot to ${login}` : 'Booting WebContainer…'}
        >
          <Upload className="w-3.5 h-3.5" strokeWidth={1.8} />
          <span className="hidden sm:inline">Snapshot</span>
       </button>

        <button
          onClick={onDisconnect}
          className="text-[#6B6560] hover:text-[#F5F4F0] text-[10px] px-1.5 py-1 rounded transition-colors"
          title="Disconnect"
        >
          ✕
       </button>
     </div>

      {open && <ConnectModal onClose={() => setOpen(false)}>
        <h3 className="text-sm font-semibold text-[#F5F4F0] mb-3" style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}>
          Snapshot to GitHub
       </h3>
        <p className="text-xs text-[#9E9890] mb-3 leading-relaxed">
          Stages every changed file (skipping <code className="text-[10px] bg-white/[0.04] px-1 py-0.5 rounded">node_modules</code>,
          {' '}<code className="text-[10px] bg-white/[0.04] px-1 py-0.5 rounded">.next</code>, etc.), commits, and pushes
         to <span className="text-[#F5F4F0] font-medium">{login}</span> / origin.
       </p>
        <label className="block text-[10px] uppercase tracking-wider text-[#6B6560] mb-1">Commit message</label>
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="what changed"
          className="w-full px-2.5 py-1.5 bg-[#111110] ring-1 ring-white/[0.06] rounded-md text-[12px] text-[#F5F4F0] placeholder:text-[#6B6560] focus:outline-none focus:ring-[#E8601A]/40"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSnapshot();
          }}
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={() => setOpen(false)}
            className="px-3 py-1.5 text-[11px] text-[#9E9890] hover:text-white transition-colors"
          >
            Cancel
         </button>
          <button
            onClick={onSnapshot}
            disabled={!message.trim() || busy}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-[#E8601A] text-white hover:bg-[#FF7A30] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />}
            {busy ? 'Pushing…' : 'Commit & Push'}
         </button>
       </div>
     </ConnectModal>}
    </>
  );
}

// ── Modal shell (lightweight, fixed positioning, click-out dismiss) ────

function ConnectModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1A1917] ring-1 ring-white/[0.08] rounded-2xl p-5 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
     </div>
   </div>
  );
}
