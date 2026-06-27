import type { FileMap } from '@/lib/workbench/stores/files';

export interface Snapshot {
  chatIndex: string;
  files: FileMap;
  summary?: string;
}
