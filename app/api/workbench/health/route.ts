// Source: bolt.diy/app/routes/api.health.ts
// Ported: Remix → Next.js route handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';


// Remix loader converted to GET handler
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
};
