import { useState, useEffect, useRef, type PropsWithChildren } from 'react';

interface ThoughtBoxProps {
  title?: string;
  isStreaming?: boolean; // true = actively thinking, false = done
}

const ThoughtBox = ({ title, children, isStreaming = false }: PropsWithChildren<ThoughtBoxProps>) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [thinkDuration, setThinkDuration] = useState(0);
  const startTimeRef = useRef(Date.now());
  // Track if we ever had a streaming phase (prevents 0s display)
  const wasStreamingRef = useRef(false);

  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      startTimeRef.current = Date.now();
      const interval = setInterval(() => {
        setThinkDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    } else if (wasStreamingRef.current) {
      // Freeze duration when streaming stops
      setThinkDuration(prev => prev || Math.round((Date.now() - startTimeRef.current) / 1000) || 1);
    }
  }, [isStreaming]);

  return (
    <div className="thought-box-root">
      {/* The pill — transitions IN PLACE from "Thinking..." → "Thought for Xs" */}
      <button
        onClick={() => !isStreaming && setIsExpanded(!isExpanded)}
        className={`thought-pill ${isStreaming ? 'thought-pill-active' : 'thought-pill-done'}`}
        type="button"
        aria-expanded={isExpanded}
      >
        {/* Sparkle icon — spins during thinking, static when done */}
        <span className={`thought-sparkle ${isStreaming ? 'sparkle-spin' : ''}`}>✦</span>

        {/* Label — smoothly changes in place */}
        <span className="thought-label">
          {isStreaming ? 'Thinking' : `Thought for ${thinkDuration || 1}s`}
        </span>

        {/* Animated dots — only during thinking, fades out when done */}
        <span className={`thought-dots ${isStreaming ? 'dots-visible' : 'dots-hidden'}`}>
          <span className="dot" style={{ animationDelay: '0ms' }}>.</span>
          <span className="dot" style={{ animationDelay: '200ms' }}>.</span>
          <span className="dot" style={{ animationDelay: '400ms' }}>.</span>
        </span>

        {/* Live duration counter — only during active thinking */}
        <span className={`thought-elapsed ${isStreaming && thinkDuration > 0 ? 'elapsed-visible' : 'elapsed-hidden'}`}>
          {thinkDuration}s
        </span>

        {/* Chevron — fades in when done (expand/collapse) */}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`thought-chevron ${isStreaming ? 'chevron-hidden' : 'chevron-visible'} ${isExpanded ? 'chevron-up' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expandable content — only when done & expanded */}
      <div className={`thought-content ${isExpanded && !isStreaming ? 'content-open' : 'content-closed'}`}>
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
          /* Smooth ALL property transitions for in-place morphing */
          transition: color 0.4s ease, background 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease, padding 0.3s ease;
        }

        /* ─── Active state: shimmer glare + glow ─── */
        .thought-pill-active {
          color: #E8601A;
          border-color: rgba(232,96,26,0.18);
          background: linear-gradient(135deg, rgba(232,96,26,0.06) 0%, rgba(232,96,26,0.02) 100%);
          box-shadow: 0 0 0 1px rgba(232,96,26,0.05), 0 1px 3px rgba(232,96,26,0.08);
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
          animation: glare 2s ease-in-out infinite;
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

        /* ─── Sparkle ─── */
        .thought-sparkle {
          font-size: 10px;
          position: relative;
          z-index: 1;
          transition: transform 0.3s ease;
        }
        .sparkle-spin {
          animation: sparkle-rotate 3s linear infinite;
        }
        @keyframes sparkle-rotate {
          0% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(90deg) scale(1.15); }
          50% { transform: rotate(180deg) scale(1); }
          75% { transform: rotate(270deg) scale(1.15); }
          100% { transform: rotate(360deg) scale(1); }
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
          transition: opacity 0.3s ease, width 0.3s ease;
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
          animation: dot-bounce 1.4s ease-in-out infinite;
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
          transition: opacity 0.3s ease, width 0.3s ease, margin 0.3s ease;
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
          transition: opacity 0.3s ease, transform 0.2s ease, width 0.3s ease, margin 0.3s ease;
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
          max-height: 300px;
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
          font-size: 12px;
          line-height: 1.6;
          padding: 8px 12px;
          border-left: 2px solid rgba(232,96,26,0.18);
          background: rgba(232,96,26,0.02);
          border-radius: 0 6px 6px 0;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 280px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  );
};

export default ThoughtBox;
