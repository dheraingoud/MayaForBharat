import path from 'path'
import os from 'os'

export function getBuildsDir(...subpaths: string[]): string {
  const root = process.env.VERCEL ? path.join(os.tmpdir(), '.maya-builds') : path.join(process.cwd(), '.maya-builds')
  return path.join(root, ...subpaths)
}
