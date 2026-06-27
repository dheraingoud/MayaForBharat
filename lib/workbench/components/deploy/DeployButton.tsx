import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '@/lib/workbench/stores/workbench';
import { streamingState } from '@/lib/workbench/stores/streaming';
import { classNames } from '@/lib/workbench/utils/classNames';
import { useState } from 'react';
import { VercelDeploymentLink } from '@/lib/workbench/components/chat/VercelDeploymentLink.client';
import { useVercelDeploy } from '@/lib/workbench/components/deploy/VercelDeploy.client';

/**
 * DeployButton — Simplified for MAYA:
 * - "Deploy to Vercel" uses our global DEPLOY_TOKEN (no user auth needed)
 * - "Deploy to Netlify" → Coming Soon
 * - "Deploy to Cloudflare" → Coming Soon
 */
export const DeployButton = () => {
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];
  const [isDeploying, setIsDeploying] = useState(false);
  const isStreaming = useStore(streamingState);
  const { handleVercelDeploy } = useVercelDeploy();

  const handleVercelDeployClick = async () => {
    setIsDeploying(true);

    try {
      await handleVercelDeploy();
    } finally {
      setIsDeploying(false);
    }
  };

  return (
    <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden text-sm">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          disabled={isDeploying || !activePreview || isStreaming}
          className="rounded-md items-center justify-center [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-60 px-3 py-1.5 text-xs bg-accent-500 text-white hover:text-bolt-elements-item-contentAccent [&:not(:disabled,.disabled)]:hover:bg-bolt-elements-button-primary-backgroundHover outline-accent-500 flex gap-1.7"
        >
          {isDeploying ? 'Deploying...' : 'Deploy'}
          <span className={classNames('i-ph:caret-down transition-transform')} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          className={classNames(
            'z-[250]',
            'bg-[#1A1917] backdrop-blur-2xl',
            'rounded-xl',
            'shadow-[0_8px_32px_rgba(0,0,0,0.7),0_0_0_1px_rgba(232,96,26,0.08)]',
            'border border-[#2A2925]',
            'animate-in fade-in-0 zoom-in-95',
            'py-1.5 min-w-[220px]',
          )}
          sideOffset={5}
          align="end"
        >
          {/* ── Deploy to Vercel (uses our global token) ──────────────── */}
          <DropdownMenu.Item
            className={classNames(
              'cursor-pointer flex items-center w-full px-4 py-2.5 text-sm text-[#D4D0CA] hover:bg-white/[0.06] hover:text-[#F5F4F0] gap-2.5 rounded-lg mx-1 transition-colors duration-150 group relative',
              {
                'opacity-60 cursor-not-allowed': isDeploying || !activePreview,
              },
            )}
            disabled={isDeploying || !activePreview}
            onClick={handleVercelDeployClick}
          >
            <img
              className="w-5 h-5 bg-black p-1 rounded"
              height="24"
              width="24"
              crossOrigin="anonymous"
              src="https://cdn.simpleicons.org/vercel/white"
              alt="vercel"
            />
            <span className="mx-auto">Deploy to Vercel</span>
            <VercelDeploymentLink />
          </DropdownMenu.Item>

          {/* ── Netlify — Coming Soon ──────────────────────────────────── */}
          <DropdownMenu.Item
            disabled
            className="flex items-center w-full rounded-lg mx-1 px-4 py-2.5 text-sm text-[#6B6560] gap-2.5 opacity-50 cursor-not-allowed"
          >
            <img
              className="w-5 h-5"
              height="24"
              width="24"
              crossOrigin="anonymous"
              src="https://cdn.simpleicons.org/netlify"
            />
            <span className="mx-auto">Deploy to Netlify (Coming Soon)</span>
          </DropdownMenu.Item>

          {/* ── Cloudflare — Coming Soon ───────────────────────────────── */}
          <DropdownMenu.Item
            disabled
            className="flex items-center w-full rounded-lg mx-1 px-4 py-2.5 text-sm text-[#6B6560] gap-2.5 opacity-50 cursor-not-allowed"
          >
            <img
              className="w-5 h-5"
              height="24"
              width="24"
              crossOrigin="anonymous"
              src="https://cdn.simpleicons.org/cloudflare"
              alt="cloudflare"
            />
            <span className="mx-auto">Deploy to Cloudflare (Coming Soon)</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );
};
