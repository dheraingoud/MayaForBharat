// Source: bolt.diy/app/routes/api.update.ts
// Ported: Remix → Next.js route handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';


// Remix action converted to POST handler
export async function POST(request: NextRequest) {
  if (request.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  }

  return NextResponse.json(
    {
      error: 'Updates must be performed manually in a server environment',
      instructions: [
        '1. Navigate to the project directory',
        '2. Run: git fetch upstream',
        '3. Run: git pull upstream main',
        '4. Run: pnpm install',
        '5. Run: pnpm run build',
      ],
    },
    { status: 400 },
  );
};
