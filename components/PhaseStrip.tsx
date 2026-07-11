'use client';
import React from 'react';
import { Check, Loader2, CircleDashed, Sparkles } from 'lucide-react';

type PhaseState = 'done' | 'active' | 'pending';

type IconComp = typeof Check;

function el(tag: any, props: any | null, ...kids: React.ReactNode[]): React.ReactElement {
  return React.createElement(tag, props || null, ...kids.flat());
}

function pill(state: PhaseState, label: string, hint?: string): React.ReactElement {
  const color =
    state === 'done'
      ? 'text-[#2D7A4F] bg-[#2D7A4F]/10 border-[#2D7A4F]/30'
      : state === 'active'
        ? 'text-[#E8601A] bg-[#E8601A]/10 border-[#E8601A]/30'
        : 'text-[#6B6560] bg-white/[0.02] border-white/[0.06]';
  const Icon: IconComp = state === 'done' ? Check : state === 'active' ? Loader2 : CircleDashed;
  const iconClass = 'w-3 h-3 shrink-0' + (state === 'active' ? ' animate-spin' : '');
  const hintSpan = hint
    ? el('span', { className: 'text-[#6B6560] normal-case tracking-normal' }, '· ' + hint)
    : null;
  return el(
    'span',
    { className: 'flex items-center gap-1.5 text-[10.5px] px-2 py-1 rounded-md border ' + color },
    el(Icon, { className: iconClass, 'aria-hidden': true }),
    el('span', { className: 'font-medium uppercase tracking-wider' }, label),
    hintSpan as any,
  );
}

interface PhaseStripProps {
  phasePlan?: PhaseState;
  phaseSetup?: PhaseState;
  phaseFiles?: PhaseState;
  phaseLive?: PhaseState;
  fileCount?: number;
}

export default function PhaseStrip(props: PhaseStripProps): React.ReactElement {
  const plan = props.phasePlan || 'done';
  const setup = props.phaseSetup || 'done';
  const files = props.phaseFiles || 'pending';
  const live = props.phaseLive || 'pending';
  const fc = props.fileCount || 0;
  return el(
    'div',
    {
      className:
        'rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#222120] to-[#1A1917] overflow-hidden mb-2 shrink-0',
    },
    el(
      'div',
      { className: 'flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.04] overflow-x-auto' },
      el(Sparkles, { className: 'w-3.5 h-3.5 text-[#E8601A] shrink-0', 'aria-hidden': true }),
      el('span', { className: 'text-[10px] uppercase tracking-widest text-[#9E9890] font-semibold shrink-0' }, 'Build'),
      el(
        'div',
        { className: 'flex items-center gap-1 ml-1 shrink-0' },
        pill(plan, 'Plan'),
        pill(setup, 'Setup'),
        pill(files, 'Files', fc > 0 ? '' + fc : undefined),
        pill(live, 'Live'),
      ),
    ),
  );
}
