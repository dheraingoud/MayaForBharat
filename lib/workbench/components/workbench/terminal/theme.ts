import type { ITheme } from '@xterm/xterm';

// Premium dark terminal theme — MAYA branded
const MAYA_TERMINAL_THEME: ITheme = {
  // Core
  cursor: '#E8601A',
  cursorAccent: '#0A0A09',
  foreground: '#D4D0CA',
  background: '#0A0A09',
  selectionBackground: 'rgba(232, 96, 26, 0.22)',
  selectionForeground: '#F5F4F0',
  selectionInactiveBackground: 'rgba(232, 96, 26, 0.10)',

  // ANSI colors — muted, harmonious palette
  black: '#1A1917',
  red: '#F87171',
  green: '#5AF78E',
  yellow: '#FBBF24',
  blue: '#7DD3FC',
  magenta: '#C084FC',
  cyan: '#67E8F9',
  white: '#D4D0CA',
  brightBlack: '#4A4742',
  brightRed: '#FCA5A5',
  brightGreen: '#86EFAC',
  brightYellow: '#FDE68A',
  brightBlue: '#BAE6FD',
  brightMagenta: '#D8B4FE',
  brightCyan: '#A5F3FC',
  brightWhite: '#F5F4F0',
};

const MAYA_TERMINAL_THEME_READONLY: Partial<ITheme> = {
  cursor: '#00000000', // Invisible cursor for readonly terminals
};

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    ...MAYA_TERMINAL_THEME,
    ...overrides,
  };
}
