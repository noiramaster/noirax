import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/account';
  if (code) {
    return NextResponse.redirect(new URL(`/api/auth/callback?code=${code}&next=${next}`, request.url));
  }
  return NextResponse.redirect(new URL('/account', request.url));
}
