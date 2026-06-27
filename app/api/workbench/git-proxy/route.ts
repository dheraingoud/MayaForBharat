// Git proxy - removed from MAYA (no git integration)
import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  return NextResponse.json({ error: 'Git proxy not available in MAYA' }, { status: 501 });
}
export async function GET(request: NextRequest) {
  return NextResponse.json({ error: 'Git proxy not available in MAYA' }, { status: 501 });
}