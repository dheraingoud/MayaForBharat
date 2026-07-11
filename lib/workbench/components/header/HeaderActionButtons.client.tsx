import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '@/lib/workbench/stores/workbench';
import { DeployButton } from '@/lib/workbench/components/deploy/DeployButton';

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

export function HeaderActionButtons({ chatStarted: _chatStarted }: HeaderActionButtonsProps) {
  const [activePreviewIndex] = useState(0);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];

  return (
    <div className="flex items-center gap-2">
      {/* Deploy Button — only shown when there's an active preview */}
      {activePreview && <DeployButton />}
    </div>
  );
}
