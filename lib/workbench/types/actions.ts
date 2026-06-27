// Source: bolt.diy/app/types/actions.ts
// Ported to MAYA workbench — no changes needed except removing \r\n
import type { Change } from 'diff';

export type ActionType = 'file' | 'shell' | 'supabase';

export interface BaseAction {
  content: string;
}

export interface FileAction extends BaseAction {
  type: 'file';
  filePath: string;
  changeSource?: string;
}

export interface ShellAction extends BaseAction {
  type: 'shell';
}

export interface StartAction extends BaseAction {
  type: 'start';
}

export interface BuildAction extends BaseAction {
  type: 'build';
}

export interface SupabaseAction extends BaseAction {
  type: 'supabase';
  operation: 'migration' | 'query';
  filePath?: string;
  projectId?: string;
}

export type BoltAction = FileAction | ShellAction | StartAction | BuildAction | SupabaseAction;

export type BoltActionData = BoltAction | BaseAction;

export interface ActionAlert {
  type: 'error' | 'warning' | 'info' | string;
  title: string;
  description: string;
  content: string;
  /**
   * Where the alert came from. Only `terminal` and `preview` trigger the
   * full error modal with retry/dismiss actions. Anything else (e.g.
   * `chat`, `generation`) is rendered as a small inline notice and
   * dismissed passively so it never blocks the editor.
   */
  source?: 'terminal' | 'preview' | 'chat' | 'generation';
}

export interface SupabaseAlert {
  type: string;
  title: string;
  description: string;
  content: string;
  source?: 'supabase';
}

export interface DeployAlert {
  type: 'success' | 'error' | 'info';
  title: string;
  description: string;
  content?: string;
  url?: string;
  stage?: 'building' | 'deploying' | 'complete';
  buildStatus?: 'pending' | 'running' | 'complete' | 'failed';
  deployStatus?: 'pending' | 'running' | 'complete' | 'failed';
  source?: 'vercel' | 'netlify' | 'github' | 'gitlab';
}

export interface LlmErrorAlertType {
  type: 'error' | 'warning';
  title: string;
  description: string;
  content?: string;
  provider?: string;
  errorType?: 'authentication' | 'rate_limit' | 'quota' | 'network' | 'unknown';
}

export interface FileHistory {
  originalContent: string;
  lastModified: number;
  changes: Change[];
  versions: {
    timestamp: number;
    content: string;
  }[];
  changeSource?: 'user' | 'auto-save' | 'external';
}
