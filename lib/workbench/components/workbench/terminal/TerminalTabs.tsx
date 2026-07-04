import { useStore } from '@nanostores/react';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Panel, type ImperativePanelHandle } from 'react-resizable-panels';
import { IconButton } from '@/lib/workbench/components/ui/IconButton';
import { shortcutEventEmitter } from '@/lib/workbench/hooks';
import { themeStore } from '@/lib/workbench/stores/theme';
import { workbenchStore } from '@/lib/workbench/stores/workbench';
import { classNames } from '@/lib/workbench/utils/classNames';
import { Terminal, type TerminalRef } from './Terminal';
import { TerminalManager } from './TerminalManager';
import { createScopedLogger } from '@/lib/workbench/utils/logger';
import { streamingState } from '@/lib/workbench/stores/streaming';

const logger = createScopedLogger('Terminal');

const MAX_TERMINALS = 5;
export const DEFAULT_TERMINAL_SIZE = 30;

export const TerminalTabs = memo(() => {
  const showTerminal = useStore(workbenchStore.showTerminal);
  const theme = useStore(themeStore);
  const isStreaming = useStore(streamingState);

  const terminalRefs = useRef<Map<number, TerminalRef>>(new Map());
  const terminalPanelRef = useRef<ImperativePanelHandle>(null);
  const terminalToggledByShortcut = useRef(false);

  const [activeTerminal, setActiveTerminal] = useState(0);
  const [terminalCount, setTerminalCount] = useState(0);

  // Status-bar state: elapsed timer ties to streamingState; line count polled
  // from the active xterm buffer. Both render in the 24px status bar below.
  const [elapsed, setElapsed] = useState(0);
  const [lineCount, setLineCount] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const wasStreamingRef = useRef(false);

  const addTerminal = () => {
    if (terminalCount < MAX_TERMINALS) {
      setTerminalCount(terminalCount + 1);
      setActiveTerminal(terminalCount);
    }
  };

  const closeTerminal = useCallback(
    (index: number) => {
      if (index === 0) {
        return;
      } // Can't close main terminal

      const terminalRef = terminalRefs.current.get(index);

      if (terminalRef?.getTerminal) {
        const terminal = terminalRef.getTerminal();

        if (terminal) {
          workbenchStore.detachTerminal(terminal);
        }
      }

      // Remove the terminal from refs
      terminalRefs.current.delete(index);

      // Adjust terminal count and active terminal
      setTerminalCount(terminalCount - 1);

      if (activeTerminal === index) {
        setActiveTerminal(Math.max(0, index - 1));
      } else if (activeTerminal > index) {
        setActiveTerminal(activeTerminal - 1);
      }
    },
    [activeTerminal, terminalCount],
  );

  useEffect(() => {
    return () => {
      terminalRefs.current.forEach((ref, index) => {
        if (index > 0 && ref?.getTerminal) {
          const terminal = ref.getTerminal();

          if (terminal) {
            workbenchStore.detachTerminal(terminal);
          }
        }
      });
    };
  }, []);

  useEffect(() => {
    const { current: terminal } = terminalPanelRef;

    if (!terminal) {
      return;
    }

    const isCollapsed = terminal.isCollapsed();

    if (!showTerminal && !isCollapsed) {
      terminal.collapse();
    } else if (showTerminal && isCollapsed) {
      terminal.resize(DEFAULT_TERMINAL_SIZE);
    }

    terminalToggledByShortcut.current = false;
  }, [showTerminal]);

  useEffect(() => {
    const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
      terminalToggledByShortcut.current = true;
    });

    const unsubscribeFromThemeStore = themeStore.subscribe(() => {
      terminalRefs.current.forEach((ref) => {
        ref?.reloadStyles();
      });
    });

    return () => {
      unsubscribeFromEventEmitter();
      unsubscribeFromThemeStore();
    };
  }, []);

  // Elapsed timer — mirrors ThoughtBox cadence. Starts when streaming begins,
  // freezes at last value when it ends (keeps the final duration visible).
  useEffect(() => {
    if (isStreaming) {
      wasStreamingRef.current = true;
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      const id = setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(id);
    } else if (wasStreamingRef.current && startTimeRef.current !== null) {
      setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      startTimeRef.current = null;
    }
  }, [isStreaming]);

  // Line count — polled from the active terminal's xterm buffer. 500ms is
  // cheap (read-only buffer.length, no DOM) and keeps the status bar live
  // as commands emit output.
  useEffect(() => {
    const readLines = () => {
      const ref = terminalRefs.current.get(activeTerminal);
      const terminal = ref?.getTerminal();
      if (terminal) {
        setLineCount(terminal.buffer.active.length);
      }
    };
    readLines();
    const id = setInterval(readLines, 500);
    return () => clearInterval(id);
  }, [activeTerminal, terminalCount]);

  return (
    <Panel
      ref={terminalPanelRef}
      defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 0}
      minSize={20}
      collapsible
      onExpand={() => {
        if (!terminalToggledByShortcut.current) {
          workbenchStore.toggleTerminal(true);
        }
      }}
      onCollapse={() => {
        if (!terminalToggledByShortcut.current) {
          workbenchStore.toggleTerminal(false);
        }
      }}
    >
      {/* Terminal container — deep black */}
      <div className="h-full flex flex-col" style={{ background: '#0A0A09' }}>

        {/* ─── Glassmorphic tab bar ─── */}
        <div
          className="flex items-center gap-0.5 min-h-[28px] px-2 shrink-0"
          style={{
            background: 'rgba(17, 17, 16, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderTop: '1px solid rgba(232, 96, 26, 0.06)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
          }}
        >
          {/* Traffic-light dots — macOS-style branding, decorative */}
          <div className="flex items-center gap-[6px] pl-1 pr-2 mr-1 shrink-0" aria-hidden>
            <span className="w-[10px] h-[10px] rounded-full" style={{ background: '#FF5F57' }} />
            <span className="w-[10px] h-[10px] rounded-full" style={{ background: '#FFBD2E' }} />
            <span className="w-[10px] h-[10px] rounded-full" style={{ background: '#27C840' }} />
          </div>

          {/* Terminal tabs */}
          {Array.from({ length: terminalCount + 1 }, (_, index) => {
            const isActive = activeTerminal === index;

            return (
              <React.Fragment key={index}>
                {index === 0 ? (
                  <button
                    className={classNames(
                      'flex items-center text-[10.5px] font-semibold tracking-wider uppercase cursor-pointer gap-1.5 px-2.5 py-1 rounded-md transition-all duration-200 relative',
                      {
                        'text-[#E8601A]': isActive,
                        'text-[#6B6560] hover:text-[#9E9890]': !isActive,
                      },
                    )}
                    style={isActive ? {
                      background: 'rgba(232, 96, 26, 0.05)',
                    } : {}}
                    onClick={() => setActiveTerminal(index)}
                  >
                    <div className="i-ph:terminal-window-fill text-xs" />
                    Terminal
                    {/* Status dot */}
                    <span
                      className={classNames(
                        'w-[5px] h-[5px] rounded-full ml-0.5 transition-all duration-300',
                        isStreaming ? 'bg-amber-400' : 'bg-emerald-400',
                      )}
                      style={isStreaming ? {
                        boxShadow: '0 0 6px rgba(251, 191, 36, 0.5)',
                        animation: 'pulse 1.5s ease-in-out infinite',
                      } : {
                        boxShadow: '0 0 4px rgba(52, 211, 153, 0.3)',
                      }}
                    />
                    {/* Active indicator bar */}
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-2 right-2 h-[1.5px] rounded-full"
                        style={{ background: '#E8601A' }}
                      />
                    )}
                  </button>
                ) : (
                  <div className="flex items-center relative">
                    <button
                      className={classNames(
                        'flex items-center text-[10.5px] font-semibold tracking-wider cursor-pointer gap-1 px-2 py-1 rounded-l-md transition-all duration-200',
                        {
                          'text-[#E8601A]': isActive,
                          'text-[#6B6560] hover:text-[#9E9890]': !isActive,
                        },
                      )}
                      style={isActive ? {
                        background: 'rgba(232, 96, 26, 0.05)',
                      } : {}}
                      onClick={() => setActiveTerminal(index)}
                    >
                      <div className="i-ph:terminal-window-fill text-xs" />
                      {terminalCount > 1 && index}
                    </button>
                    <span
                      role="button"
                      tabIndex={0}
                      className="flex items-center justify-center px-1 h-full rounded-r-md text-[#4A4742] hover:text-[#F87171] cursor-pointer transition-all duration-200"
                      style={isActive ? {
                        background: 'rgba(232, 96, 26, 0.05)',
                      } : {}}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTerminal(index);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') closeTerminal(index);
                      }}
                    >
                      <div className="i-ph:x text-[9px]" />
                    </span>
                    {/* Active indicator bar */}
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-1.5 right-1.5 h-[1.5px] rounded-full"
                        style={{ background: '#E8601A' }}
                      />
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* Separator */}
          <div className="w-px h-3 mx-1" style={{ background: 'rgba(255,255,255,0.04)' }} />

          {/* Action buttons — compact cluster */}
          <div className="flex items-center gap-px">
            {terminalCount < MAX_TERMINALS && (
              <IconButton
                icon="i-ph:plus"
                title="New Terminal"
                size="md"
                className="text-[#4A4742] hover:text-[#E8601A] transition-colors duration-200"
                onClick={addTerminal}
              />
            )}
            <IconButton
              icon="i-ph:arrow-clockwise"
              title="Reset Terminal"
              size="md"
              className="text-[#4A4742] hover:text-[#D4D0CA] transition-colors duration-200"
              onClick={() => {
                const ref = terminalRefs.current.get(activeTerminal);

                if (ref?.getTerminal()) {
                  const terminal = ref.getTerminal()!;
                  terminal.clear();
                  terminal.focus();

                  if (activeTerminal === 0) {
                    workbenchStore.attachBoltTerminal(terminal);
                  } else {
                    workbenchStore.attachTerminal(terminal);
                  }
                }
              }}
            />
          </div>

          {/* Separator */}
          <div className="w-px h-3 mx-0.5" style={{ background: 'rgba(255,255,255,0.04)' }} />

          {/* Copy/scroll cluster */}
          <div className="flex items-center gap-px">
            <IconButton
              icon="i-ph:clipboard-text"
              title="Copy selection"
              size="md"
              className="text-[#4A4742] hover:text-[#D4D0CA] transition-colors duration-200"
              onClick={() => {
                const ref = terminalRefs.current.get(activeTerminal);
                if (ref?.getTerminal()) {
                  const terminal = ref.getTerminal()!;
                  const selection = terminal.getSelection();
                  if (selection) {
                    navigator.clipboard.writeText(selection);
                  } else {
                    // Copy last ~50 lines of buffer
                    const buffer = terminal.buffer.active;
                    const lines: string[] = [];
                    const startRow = Math.max(0, buffer.cursorY - 50);
                    for (let i = startRow; i <= buffer.cursorY; i++) {
                      const line = buffer.getLine(i);
                      if (line) lines.push(line.translateToString(true));
                    }
                    navigator.clipboard.writeText(lines.join('\n').trim());
                  }
                }
              }}
            />
            <IconButton
              icon="i-ph:copy"
              title="Copy all output"
              size="md"
              className="text-[#4A4742] hover:text-[#D4D0CA] transition-colors duration-200"
              onClick={() => {
                const ref = terminalRefs.current.get(activeTerminal);
                if (ref?.getTerminal()) {
                  const terminal = ref.getTerminal()!;
                  const buffer = terminal.buffer.active;
                  const lines: string[] = [];
                  for (let i = 0; i <= buffer.length - 1; i++) {
                    const line = buffer.getLine(i);
                    if (line) lines.push(line.translateToString(true));
                  }
                  navigator.clipboard.writeText(lines.join('\n').trim());
                }
              }}
            />

            <IconButton
              icon="i-ph:arrow-down"
              title="Scroll to bottom"
              size="md"
              className="text-[#4A4742] hover:text-[#E8601A] transition-colors duration-200"
              onClick={() => {
                const ref = terminalRefs.current.get(activeTerminal);
                if (ref?.getTerminal()) {
                  ref.getTerminal()!.scrollToBottom();
                }
              }}
            />
          </div>

          {/* Separator */}
          <div className="w-px h-3 mx-0.5" style={{ background: 'rgba(255,255,255,0.04)' }} />

          <IconButton
            icon="i-ph:stop-circle"
            title="Send Ctrl+C"
            size="md"
            className="text-[#4A4742] hover:text-[#F87171] transition-colors duration-200"
            onClick={() => {
              const ref = terminalRefs.current.get(activeTerminal);
              if (ref?.getTerminal()) {
                // Write ETX (Ctrl+C) to terminal input
                ref.getTerminal()!.input('\x03', true);
              }
            }}
          />

          {/* Close button — pushed right */}
          <IconButton
            className="ml-auto text-[#4A4742] hover:text-[#D4D0CA] transition-colors duration-200"
            icon="i-ph:caret-down"
            title="Close Terminal"
            size="md"
            onClick={() => workbenchStore.toggleTerminal(false)}
          />
        </div>

        {/* ─── Terminal panels — flex-1 region between header & status bar ─── */}
        <div className="flex-1 min-h-0 relative overflow-hidden">
        {Array.from({ length: terminalCount + 1 }, (_, index) => {
          const isActive = activeTerminal === index;

          if (index == 0) {
            return (
              <React.Fragment key={`terminal-container-${index}`}>
                <Terminal
                  key={`terminal-${index}`}
                  id={`terminal_${index}`}
                  className={classNames('h-full modern-scrollbar-invert', {
                    hidden: !isActive,
                  })}
                  ref={(ref) => {
                    if (ref) {
                      terminalRefs.current.set(index, ref);
                    }
                  }}
                  onTerminalReady={(terminal) => workbenchStore.attachBoltTerminal(terminal)}
                  onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                  theme={theme}
                />
                <TerminalManager
                  terminal={terminalRefs.current.get(index)?.getTerminal() || null}
                  isActive={isActive}
                />
              </React.Fragment>
            );
          } else {
            return (
              <React.Fragment key={`terminal-container-${index}`}>
                <Terminal
                  key={`terminal-${index}`}
                  id={`terminal_${index}`}
                  className={classNames('modern-scrollbar h-full overflow-hidden', {
                    hidden: !isActive,
                  })}
                  ref={(ref) => {
                    if (ref) {
                      terminalRefs.current.set(index, ref);
                    }
                  }}
                  onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal)}
                  onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                  theme={theme}
                />
                <TerminalManager
                  terminal={terminalRefs.current.get(index)?.getTerminal() || null}
                  isActive={isActive}
                />
              </React.Fragment>
            );
          }
        })}
        </div>

        {/* ─── Status bar — 24px: running/idle dot + elapsed + line count ─── */}
        <div
          className="flex items-center gap-2 min-h-[24px] px-3 shrink-0 text-[10px] font-mono tracking-tight"
          style={{
            background: 'rgba(10, 10, 9, 0.9)',
            borderTop: '1px solid rgba(255, 255, 255, 0.03)',
            color: '#6B6560',
          }}
        >
          <span className="flex items-center gap-1.5">
            <span
              className={classNames('w-[6px] h-[6px] rounded-full transition-all duration-300', isStreaming ? 'bg-amber-400' : 'bg-emerald-400')}
              style={isStreaming ? {
                boxShadow: '0 0 6px rgba(251, 191, 36, 0.5)',
                animation: 'pulse 1.5s ease-in-out infinite',
              } : {
                boxShadow: '0 0 4px rgba(52, 211, 153, 0.3)',
              }}
            />
            <span style={{ color: isStreaming ? '#D4D0CA' : '#4A4742' }}>
              {isStreaming ? 'Running' : 'Idle'}
            </span>
          </span>

          {isStreaming && elapsed > 0 && (
            <span style={{ color: '#9E9890' }}>{elapsed}s</span>
          )}

          {/* Spacer pushes meta to the right */}
          <div className="ml-auto flex items-center gap-3" style={{ color: '#4A4742' }}>
            <span>{lineCount} lines</span>
            <span style={{ color: '#3A3835' }}>·</span>
            <span className="uppercase tracking-wider">bash</span>
          </div>
        </div>
      </div>
    </Panel>
  );
});
