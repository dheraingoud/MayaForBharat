import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import type { ProgressAnnotation } from '@/lib/workbench/types/context';
import { cubicEasingFn } from '@/lib/workbench/utils/easings';
import { Check, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

export default function ProgressCompilation({ data }: { data?: ProgressAnnotation[] }) {
  const [progressList, setProgressList] = React.useState<ProgressAnnotation[]>([]);
  const [expanded, setExpanded] = useState(false);

  React.useEffect(() => {
    if (!data || data.length === 0) {
      setProgressList([]);
      return;
    }

    const progressMap = new Map<string, ProgressAnnotation>();
    data.forEach((x) => {
      const existingProgress = progressMap.get(x.label);
      if (existingProgress && existingProgress.status === 'complete') {
        return;
      }
      progressMap.set(x.label, x);
    });

    const newData = Array.from(progressMap.values());
    newData.sort((a, b) => a.order - b.order);
    setProgressList(newData);
  }, [data]);

  if (progressList.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <div className="bg-[#1A1917] border border-white/[0.08] shadow-lg rounded-lg relative w-full mx-auto z-10 p-1">
        <div className="bg-[#222120] p-1.5 rounded-lg text-[#D4D0CA] flex">
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {expanded ? (
                <motion.div
                  key="expanded"
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  {progressList.map((x, i) => (
                    <ProgressItem key={x.label || i} progress={x} />
                  ))}
                </motion.div>
              ) : (
                <ProgressItem key="collapsed" progress={progressList.slice(-1)[0]} />
              )}
            </AnimatePresence>
          </div>
          {progressList.length > 1 && (
            <motion.button
              initial={{ width: 0 }}
              animate={{ width: 'auto' }}
              exit={{ width: 0 }}
              transition={{ duration: 0.15, ease: cubicEasingFn }}
              className="p-1 rounded-lg text-[#6B6560] hover:text-[#D4D0CA] hover:bg-white/[0.05] transition-colors shrink-0"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </motion.button>
          )}
        </div>
      </div>
    </AnimatePresence>
  );
}

const ProgressItem = ({ progress }: { progress: ProgressAnnotation }) => {
  return (
    <motion.div
      className="flex items-center text-[12px] gap-2 px-1 py-0.5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="shrink-0">
        {progress.status === 'in-progress' ? (
          <Loader2 className="w-3 h-3 text-[#E8601A] animate-spin" />
        ) : progress.status === 'complete' ? (
          <Check className="w-3 h-3 text-emerald-400" />
        ) : null}
      </div>
      <span className="truncate">{progress.message}</span>
    </motion.div>
  );
};
