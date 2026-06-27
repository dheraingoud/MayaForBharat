// Source: bolt.diy/app/utils/logger.ts
// Ported: process.env → process.env for Next.js

export type DebugLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'none';

type LoggerFunction = (...messages: any[]) => void;

interface Logger {
  trace: LoggerFunction;
  debug: LoggerFunction;
  info: LoggerFunction;
  warn: LoggerFunction;
  error: LoggerFunction;
  setLevel: (level: DebugLevel) => void;
}

let currentLevel: DebugLevel = (process.env.NEXT_PUBLIC_LOG_LEVEL as DebugLevel) || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');

export const logger: Logger = {
  trace: (...messages: any[]) => logWithDebugCapture('trace', undefined, messages),
  debug: (...messages: any[]) => logWithDebugCapture('debug', undefined, messages),
  info: (...messages: any[]) => logWithDebugCapture('info', undefined, messages),
  warn: (...messages: any[]) => logWithDebugCapture('warn', undefined, messages),
  error: (...messages: any[]) => logWithDebugCapture('error', undefined, messages),
  setLevel,
};

export function createScopedLogger(scope: string): Logger {
  return {
    trace: (...messages: any[]) => logWithDebugCapture('trace', scope, messages),
    debug: (...messages: any[]) => logWithDebugCapture('debug', scope, messages),
    info: (...messages: any[]) => logWithDebugCapture('info', scope, messages),
    warn: (...messages: any[]) => logWithDebugCapture('warn', scope, messages),
    error: (...messages: any[]) => logWithDebugCapture('error', scope, messages),
    setLevel,
  };
}

function setLevel(level: DebugLevel) {
  if ((level === 'trace' || level === 'debug') && process.env.NODE_ENV === 'production') {
    return;
  }
  currentLevel = level;
}

function log(level: DebugLevel, scope: string | undefined, messages: any[]) {
  const levelOrder: DebugLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'none'];

  if (levelOrder.indexOf(level) < levelOrder.indexOf(currentLevel)) {
    return;
  }

  if (currentLevel === 'none') {
    return;
  }

  const allMessages = messages.reduce((acc, current) => {
    if (acc.endsWith('\n')) {
      return acc + current;
    }
    if (!acc) {
      return current;
    }
    return `${acc} ${current}`;
  }, '');

  const labelBackgroundColor = getColorForLevel(level);
  const labelTextColor = level === 'warn' ? '#000000' : '#FFFFFF';

  const labelStyles = getLabelStyles(labelBackgroundColor, labelTextColor);
  const scopeStyles = getLabelStyles('#77828D', 'white');

  const styles = [labelStyles];

  if (typeof scope === 'string') {
    styles.push('', scopeStyles);
  }

  if (typeof window !== 'undefined') {
    console.log(`%c${level.toUpperCase()}${scope ? `%c %c${scope}` : ''}`, ...styles, allMessages);
  } else {
    // Server-side: plain text logging
    const prefix = scope ? `[${level.toUpperCase()}] [${scope}]` : `[${level.toUpperCase()}]`;
    console.log(prefix, allMessages);
  }
}

function getLabelStyles(color: string, textColor: string) {
  return `background-color: ${color}; color: white; border: 4px solid ${color}; color: ${textColor};`;
}

function getColorForLevel(level: DebugLevel): string {
  switch (level) {
    case 'trace':
    case 'debug':
      return '#77828D';
    case 'info':
      return '#1389FD';
    case 'warn':
      return '#FFDB6C';
    case 'error':
      return '#EE4744';
    default:
      return '#000000';
  }
}

export const renderLogger = createScopedLogger('Render');

// Debug logging integration
let debugLoggerInstance: any = null;

const getDebugLogger = () => {
  if (!debugLoggerInstance && typeof window !== 'undefined') {
    try {
      import('./debugLogger')
        .then(({ debugLogger: loggerInst }) => {
          debugLoggerInstance = loggerInst;
        })
        .catch(() => {
          // Debug logger not available, skip integration
        });
    } catch {
      // Debug logger not available, skip integration
    }
  }
  return debugLoggerInstance;
};

function logWithDebugCapture(level: DebugLevel, scope: string | undefined, messages: any[]) {
  log(level, scope, messages);

  const debug = getDebugLogger();
  if (debug) {
    debug.captureLog(level, scope, messages);
  }
}
