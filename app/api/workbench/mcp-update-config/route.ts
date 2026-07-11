// Source: bolt.diy/app/routes/api.mcp-update-config.ts
// Ported: Remix action → Next.js POST handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { createScopedLogger } from '@/lib/workbench/utils/logger';
import { MCPService, type MCPConfig } from '@/lib/workbench/services/mcpService';

const logger = createScopedLogger('api.mcp-update-config');

export async function POST(request: NextRequest) {
  try {
    const mcpConfig = (await request.json()) as MCPConfig;

    if (!mcpConfig || typeof mcpConfig !== 'object') {
      return NextResponse.json({ error: 'Invalid MCP servers configuration' }, { status: 400 });
    }

    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.updateConfig(mcpConfig);

    return NextResponse.json(serverTools);
  } catch (error) {
    logger.error('Error updating MCP config:', error);
    return NextResponse.json({ error: 'Failed to update MCP config' }, { status: 500 });
  }
}
