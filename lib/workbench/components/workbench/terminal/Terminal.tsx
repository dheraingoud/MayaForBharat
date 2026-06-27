// @ts-nocheck
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal as XTerm } from '@xterm/xterm';
import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import type { Theme } from '@/lib/workbench/stores/theme';
import { createScopedLogger } from '@/lib/workbench/utils/logger';
import { getTerminalTheme } from './theme';

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

        // Auto-scroll to bottom when new data is written
        const onWriteDisposable = terminal.onWriteParsed(() => {
          terminal.scrollToBottom();
        });

        // Refit after a brief delay to handle initial layout
        setTimeout(() => {
          try { fitAddon.fit(); } catch { /* ignore */ }
        }, 50);

        logger.debug(`Attach [${id}]`);

        onTerminalReady?.(terminal);

        return () => {
          try {
            onWriteDisposable.dispose();
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
