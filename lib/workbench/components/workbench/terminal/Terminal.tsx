// @ts-nocheck
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal as XTerm } from '@xterm/xterm';
import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import type { Theme } from '@/lib/workbench/stores/theme';
import { createScopedLogger } from '@/lib/workbench/utils/logger';
import { getTerminalTheme } from './theme';
import { decideFollowOnWrite } from './terminal-scroll';

const logger = createScopedLogger('Terminal');

export interface TerminalRef {
  reloadStyles: () => void;
  getTerminal: () => XTerm | undefined;
}

export interface TerminalProps {
  className?: string;
  theme: Theme;
  readonly?: boolean;
  id: string;
  onTerminalReady?: (terminal: XTerm) => void;
  onTerminalResize?: (cols: number, rows: number) => void;
}

export const Terminal = memo(
  forwardRef<TerminalRef, TerminalProps>(
    ({ className, theme, readonly, id, onTerminalReady, onTerminalResize }, ref) => {
      const terminalElementRef = useRef<HTMLDivElement>(null);
      const terminalRef = useRef<XTerm>();
      const fitAddonRef = useRef<FitAddon>();
      const resizeObserverRef = useRef<ResizeObserver>();
      // Stick-to-bottom scroll tracking. Without this, onWriteParsed fires
      // scrollToBottom unconditionally and yanks the viewport back down when a
      // user has scrolled up to read history — the "unscrollable" bug.
      const userScrolledUpRef = useRef(false);

      useEffect(() => {
        const element = terminalElementRef.current!;

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        fitAddonRef.current = fitAddon;

        const terminal = new XTerm({
          cursorBlink: true,
          cursorStyle: 'bar',
          cursorInactiveStyle: 'outline',
          convertEol: true,
          disableStdin: readonly,
          theme: getTerminalTheme(readonly ? { cursor: '#00000000' } : {}),
          fontSize: 12.5,
          lineHeight: 1.35,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
          fontWeight: '400',
          fontWeightBold: '600',
          letterSpacing: 0.2,
          allowProposedApi: true,
          scrollback: 10000,
          scrollOnUserInput: true,
          scrollSensitivity: 3,
          fastScrollSensitivity: 5,
          fastScrollModifier: 'alt',

          // Enable better clipboard handling
          rightClickSelectsWord: true,
        });

        terminalRef.current = terminal;

        // Error handling for addon loading
        try {
          terminal.loadAddon(fitAddon);
          terminal.loadAddon(webLinksAddon);

          terminal.open(element);
        } catch (error) {
          logger.error(`Failed to initialize terminal [${id}]:`, error);

          // Attempt recovery
          setTimeout(() => {
            try {
              terminal.open(element);
              fitAddon.fit();
            } catch (retryError) {
              logger.error(`Terminal recovery failed [${id}]:`, retryError);
            }
          }, 100);
        }

        const resizeObserver = new ResizeObserver((entries) => {
          // Debounce resize events
          if (entries.length > 0) {
            try {
              fitAddon.fit();
              onTerminalResize?.(terminal.cols, terminal.rows);
            } catch (error) {
              logger.error(`Resize error [${id}]:`, error);
            }
          }
        });

        resizeObserverRef.current = resizeObserver;
        resizeObserver.observe(element);

        // Track user scroll intent: when the viewport moves off the bottom
        // (viewportY < baseY), the user is reading history — suppress
        // auto-scroll so writes don't yank them back down. onResume gets
        // them back to bottom and re-enables auto-follow.
        const isAtBottom = () => {
          try {
            const buf = terminal.buffer.active;
            return buf.viewportY >= buf.baseY;
          } catch {
            return true;
          }
        };

        const onScrollDisposable = terminal.onScroll(() => {
          userScrolledUpRef.current = !isAtBottom();
        });

        // Auto-scroll to bottom on new data ONLY when the user is already
        // at the bottom. F3: re-query the actual bottom at write time rather
        // than trusting userScrolledUpRef (cached from the last onScroll) —
        // during a fast write flood (npm install), xterm can fire a transient
        // onScroll with viewportY < baseY before the viewport re-pins, flipping
        // the ref true even though no user scrolled, which then gated
        // scrollToBottom for the rest of the flood. The live bottom check is
        // authoritative; the ref is an advisory hint that self-heals here.
        const onWriteDisposable = terminal.onWriteParsed(() => {
          const { follow, newRef } = decideFollowOnWrite(
            userScrolledUpRef.current,
            isAtBottom(),
          );
          userScrolledUpRef.current = newRef;
          if (follow) {
            terminal.scrollToBottom();
          }
        });

        // Re-enable auto-follow when the user types — they're engaging the
        // prompt again and expect to see their command's output stream by.
        const onDataDisposable = terminal.onData(() => {
          userScrolledUpRef.current = false;
          terminal.scrollToBottom();
        });

        // Double-RAF initial fit instead of a fixed setTimeout race — the
        // outer RAF waits for the layout pass, the inner RAF waits for the
        // paint, so xterm measures the real container box.
        const fitInitial = () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              try { fitAddon.fit(); } catch { /* ignore */ }
            });
          });
        };
        fitInitial();

        logger.debug(`Attach [${id}]`);

        onTerminalReady?.(terminal);

        return () => {
          try {
            onWriteDisposable.dispose();
            onScrollDisposable.dispose();
            onDataDisposable.dispose();
            resizeObserver.disconnect();
            terminal.dispose();
          } catch (error) {
            logger.error(`Cleanup error [${id}]:`, error);
          }
        };
      }, []);

      useEffect(() => {
        const terminal = terminalRef.current!;

        // we render a transparent cursor in case the terminal is readonly
        terminal.options.theme = getTerminalTheme(readonly ? { cursor: '#00000000' } : {});

        terminal.options.disableStdin = readonly;
      }, [theme, readonly]);

      useImperativeHandle(ref, () => {
        return {
          reloadStyles: () => {
            const terminal = terminalRef.current;

            if (terminal) {
              terminal.options.theme = getTerminalTheme(readonly ? { cursor: '#00000000' } : {});
            }
          },
          getTerminal: () => {
            return terminalRef.current;
          },
        };
      }, [readonly]);

      return <div className={`${className || ''} maya-terminal`} ref={terminalElementRef} />;
    },
  ),
);
