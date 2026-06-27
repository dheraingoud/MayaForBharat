// Source: bolt.diy/app/routes/api.supabase.query.ts
// Ported: Remix action → Next.js POST handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { createScopedLogger } from '@/lib/workbench/utils/logger';

const logger = createScopedLogger('api.supabase.query');

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return new Response('No authorization token provided', { status: 401 });
  }

  try {
    const { projectId, query } = (await request.json()) as any;
    logger.debug('Executing query:', { projectId, query });

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;

      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        console.log(e);
        errorData = { message: errorText };
      }

      logger.error('Supabase API error:', JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      }));

      return NextResponse.json({
        error: {
          status: response.status,
          statusText: response.statusText,
          message: errorData.message || errorData.error || errorText,
          details: errorData,
        },
      }, { status: response.status });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Query execution error:', error);
    return NextResponse.json({
      error: {
        message: error instanceof Error ? error.message : 'Query execution failed',
        stack: error instanceof Error ? error.stack : undefined,
      },
    }, { status: 500 });
  }
}
