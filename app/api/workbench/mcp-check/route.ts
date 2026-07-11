// Source: bolt.diy/app/routes/api.mcp-check.ts
// Ported: Remix → Next.js route handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { createScopedLogger } from '@/lib/workbench/utils/logger';
import { MCPService } from '@/lib/workbench/services/mcpService';

const logger = createScopedLogger('api.mcp-check');

export async function GET() {
  try {
    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.checkServersAvailabilities();

    return Response.json(serverTools);
  } catch (error) {
    logger.error('Error checking MCP servers:', error);
    return Response.json({ error: 'Failed to check MCP servers' }, { status: 500 });
  }
}
