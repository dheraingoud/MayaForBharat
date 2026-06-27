// @ts-nocheck
import { useStore } from '@nanostores/react';
import { ClientOnly } from '@/lib/workbench/components/ui/ClientOnly';
import { chatStore } from '@/lib/workbench/stores/chat';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '@/lib/workbench/persistence/ChatDescription.client';

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className="flex items-center px-3 h-11 border-b border-white/[0.06] bg-[#1A1917] shrink-0 z-30"
    >
      {/* Left: MAYA logo */}
      <div className="flex items-center gap-2 z-logo text-bolt-elements-textPrimary shrink-0">
        <div className="i-ph:sidebar-simple-duotone text-xl text-[#6B6560]" />
        <a href="/" className="flex items-center">
          <img src="/logo-dark-styled.png" alt="MAYA" className="w-[70px] inline-block" />
        </a>
      </div>

      {/* Center: Chat description / title */}
      <span className="flex-1 px-4 truncate text-center text-[13px] text-[#9E9890]" style={{ fontFamily: 'var(--font-outfit, var(--font-sora))' }}>
        <ClientOnly>{() => <ChatDescription />}</ClientOnly>
      </span>

      {/* Right: Action buttons (deploy, etc — no export) */}
      <ClientOnly>
        {() => (
          <div className="shrink-0">
            <HeaderActionButtons chatStarted={true} />
          </div>
        )}
      </ClientOnly>
    </header>
  );
}
