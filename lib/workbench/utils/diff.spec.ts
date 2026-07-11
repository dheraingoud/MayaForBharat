// Source: bolt.diy/app/utils/diff.spec.ts
// Ported to MAYA paths

import { describe, expect, it } from 'vitest';
import { extractRelativePath } from '@/lib/workbench/utils/diff';
import { WORK_DIR } from '@/lib/workbench/utils/constants';

describe('Diff', () => {
  it('should strip out Work_dir', () => {
    const filePath = `${WORK_DIR}/index.js`;
    const result = extractRelativePath(filePath);
    expect(result).toBe('index.js');
  });
});
