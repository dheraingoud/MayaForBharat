import { useState, useEffect, useRef, type PropsWithChildren } from 'react';

interface ThoughtBoxProps {
  title?: string;
  isStreaming?: boolean; // true = actively thinking, false = done
  language?: 'hi' | 'en'; // localize label to match the user's chat language
}

// MAYA speaks the user's language. The pill morphs in place:
//   thinking  → "Thinking"           / "Soch rahi hoon"
//   done      → "Thought for Xs"     / "{n} sec mein socha"
// The reasoning content itself is buffered (never streamed live in the pill);
// the optional chevron reveals the buffered text on click, never live.
const ThoughtBox = ({ title, children, isStreaming = false, language = 'en' }: PropsWithChildren<ThoughtBoxProps>) => {
  // vercel reasoning.tsx state machine: default open when streaming, auto-open
  // on stream start, auto-close 1000ms after stream ends (once only, regardless
  // of user toggle). Duration tracked from stream start to end.
  const [isExpanded, setIsExpanded] = useState(isStreaming);
  const [thinkDuration, setThinkDuration] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const wasStreamingRef = useRef(false);
  const hasAutoClosedRef = useRef(false);

  // Track streaming start + compute duration on end (vercel reasoning.tsx:88-98)
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      const interval = setInterval(() => {
        if (startTimeRef.current !== null) {
          setThinkDuration(Math.ceil((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    } else if (startTimeRef.current !== null) {
      setThinkDuration(Math.ceil((Date.now() - startTimeRef.current) / 1000));
      startTimeRef.current = null;
    }
  }, [isStreaming]);

  // Auto-open when streaming starts (vercel reasoning.tsx:101-105)
  useEffect(() => {
    if (isStreaming && !isExpanded) {
      setIsExpanded(true);
    }
  }, [isStreaming, isExpanded]);

  // Auto-close 1000ms after stream ends, once only (vercel reasoning.tsx:108-122)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && isExpanded && !hasAutoClosedRef.current) {
      const t = setTimeout(() => {
        setIsExpanded(false);
        hasAutoClosedRef.current = true;
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [isStreaming, isExpanded]);

  return (
    <div className="thought-box-root">
      {/* The pill — transitions IN PLACE from "Thinking..." → "Thought for Xs" */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`thought-pill ${isStreaming ? 'thought-pill-active' : 'thought-pill-done'}`}
        type="button"
        aria-expanded={isExpanded}
      >
        {/* Brain icon — gentle pulse while thinking, static when done (no emoji) */}
        <div className={`i-ph:brain w-3 h-3 thought-sparkle ${isStreaming ? 'brain-pulse' : ''}`} />

        {/* Label — vercel ReasoningTrigger: "Thinking..." while streaming,
            "Thought for Ns" when done. Bilingual. */}
        <span className="thought-label">
          {isStreaming
            ? (language === 'hi' ? 'Soch rahi hoon...' : 'Thinking...')
            : (language === 'hi' ? `${thinkDuration || 1} sec mein socha` : `Thought for ${thinkDuration || 1}s`)}
        </span>

        {/* Chevron — always visible, rotates when expanded (vercel pattern). */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`thought-chevron chevron-visible ${isExpanded ? 'chevron-up' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expandable content — expandable during stream AND when done */}
      <div className={`thought-content ${isExpanded ? 'content-open' : 'content-closed'}`}>
        <div className="thought-content-inner">
          {children}
        </div>
      </div>

      <style jsx>{`
        .thought-box-root {
          margin: 4px 0 6px 0;
        }

        /* ─── Pill base ─── */
        .thought-pill {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          border: 1px solid transparent;
          background: transparent;
          letter-spacing: -0.01em;
          /* Liquid-glass inner refraction: 1px inner highlight + tinted inner shadow */
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
          /* Smooth ALL property transitions for in-place morphing — custom spring-ish curve, never linear/ease-in-out */
          transition: color 0.45s cubic-bezier(0.32, 0.72, 0, 1), background 0.45s cubic-bezier(0.32, 0.72, 0, 1), border-color 0.45s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.45s cubic-bezier(0.32, 0.72, 0, 1), padding 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* ─── Active state: shimmer glare + glow ─── */
        .thought-pill-active {
          color: #E8601A;
          border-color: rgba(232,96,26,0.18);
          background: linear-gradient(135deg, rgba(232,96,26,0.06) 0%, rgba(232,96,26,0.02) 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(232,96,26,0.05), 0 1px 3px rgba(232,96,26,0.08);
        }
        .thought-pill-active::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(232,96,26,0.12) 35%,
            rgba(232,96,26,0.22) 50%,
            rgba(232,96,26,0.12) 65%,
            transparent 100%
          );
          animation: glare 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
          pointer-events: none;
        }
        @keyframes glare {
          0% { left: -100%; }
          100% { left: 100%; }
        }
        .thought-pill-active:hover {
          background: linear-gradient(135deg, rgba(232,96,26,0.1) 0%, rgba(232,96,26,0.04) 100%);
          border-color: rgba(232,96,26,0.28);
        }

        /* ─── Done state: muted, interactive ─── */
        .thought-pill-done {
          color: #7A7570;
          border-color: rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.02);
          box-shadow: none;
        }
        .thought-pill-done::after {
          display: none;
        }
        .thought-pill-done:hover {
          color: #E8601A;
          background: rgba(232,96,26,0.06);
          border-color: rgba(232,96,26,0.15);
        }

        /* ─── Brain icon ─── */
        .thought-sparkle {
          position: relative;
          z-index: 1;
          flex-shrink: 0;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .brain-pulse {
          animation: brain-pulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes brain-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.18); opacity: 1; }
        }

        /* ─── Label — stays in place, text changes ─── */
        .thought-label {
          position: relative;
          z-index: 1;
          white-space: nowrap;
        }

        /* ─── Animated dots — fade in/out in place ─── */
        .thought-dots {
          display: inline-flex;
          gap: 0;
          position: relative;
          z-index: 1;
          transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .dots-visible {
          opacity: 1;
          width: 12px;
        }
        .dots-hidden {
          opacity: 0;
          width: 0;
        }
        .dot {
          animation: dot-bounce 1.4s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
          font-weight: 800;
          font-size: 12px;
        }
        @keyframes dot-bounce {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }

        /* ─── Elapsed counter — fades in/out ─── */
        .thought-elapsed {
          font-size: 10px;
          font-weight: 500;
          color: rgba(232,96,26,0.45);
          position: relative;
          z-index: 1;
          transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s cubic-bezier(0.16, 1, 0.3, 1), margin 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
          white-space: nowrap;
        }
        .elapsed-visible {
          opacity: 1;
          width: auto;
          margin-left: 4px;
        }
        .elapsed-hidden {
          opacity: 0;
          width: 0;
          margin-left: 0;
        }

        /* ─── Chevron — fades in when done ─── */
        .thought-chevron {
          position: relative;
          z-index: 1;
          transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.32, 0.72, 0, 1), width 0.3s cubic-bezier(0.16, 1, 0.3, 1), margin 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .chevron-visible {
          opacity: 0.5;
          width: 10px;
          margin-left: 2px;
        }
        .chevron-hidden {
          opacity: 0;
          width: 0;
          margin-left: 0;
        }
        .chevron-up {
          transform: rotate(180deg);
        }

        /* ─── Expandable content — smooth open/close ─── */
        .thought-content {
          overflow: hidden;
          transition: max-height 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease, margin 0.3s ease;
        }
        .content-open {
          max-height: 380px;
          opacity: 1;
          margin: 6px 0 6px 8px;
        }
        .content-closed {
          max-height: 0;
          opacity: 0;
          margin: 0;
        }
        .thought-content-inner {
          color: #6B6560;
          font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11.5px;
          line-height: 1.65;
          padding: 10px 14px;
          border-left: 2px solid rgba(232,96,26,0.18);
          background: rgba(232,96,26,0.02);
          border-radius: 0 6px 6px 0;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 360px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
};

export default ThoughtBox;
