import { promises as fs } from 'fs'
import path from 'path'

export interface FileOperation {
  type: 'write' | 'delete'
  path: string
  content?: string
}

export function parseModelOutput(output: string): FileOperation[] {
  const operations: FileOperation[] = []
  
  // Regex to match <maya-write path="...">...</maya-write>
  const writeRegex = /<maya-write\s+path=["']([^"']+)["'][^>]*>\s*([\s\S]*?)<\/maya-write>/g
  let match
  
  while ((match = writeRegex.exec(output)) !== null) {
    operations.push({
      type: 'write',
      path: match[1],
      content: match[2],
    })
  }

  // Regex to match <maya-delete path="..." />
  const deleteRegex = /<maya-delete\s+path="([^"]+)"\s*\/>/g
  while ((match = deleteRegex.exec(output)) !== null) {
    operations.push({
      type: 'delete',
      path: match[1],
    })
  }

  return operations
}

export async function executeOperations(baseDir: string, operations: FileOperation[]) {
  for (const op of operations) {
    const fullPath = path.join(baseDir, op.path)
    
    // Prevent directory traversal
    if (!fullPath.startsWith(path.resolve(baseDir))) {
      console.warn(`[tags] Prevented out-of-bounds write to ${fullPath}`)
      continue
    }

    if (op.type === 'write') {
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, op.content || '', 'utf-8')
    } else if (op.type === 'delete') {
      try {
        await fs.unlink(fullPath)
      } catch (e: any) {
        if (e.code !== 'ENOENT') {
          console.warn(`[tags] Failed to delete file ${fullPath}:`, e.message)
        }
      }
    }
  }
}
