import { NextResponse, type NextRequest } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export async function POST(request: NextRequest): Promise<NextResponse> {
  await clearSessionCookie();
  return NextResponse.redirect(new URL('/', request.url));
}
