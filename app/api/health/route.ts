import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: Date.now() });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
