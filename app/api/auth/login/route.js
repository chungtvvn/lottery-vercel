import { NextResponse } from 'next/server';

const PASSWORD = process.env.APP_ACCESS_PASSWORD || '12345678@';
const SESSION_COOKIE = 'xsmb_session';
const SESSION_VALUE = 'authenticated';

export async function POST(request) {
    const body = await request.json().catch(() => ({}));
    const next = typeof body.next === 'string' && body.next.startsWith('/') && !body.next.startsWith('//')
        ? body.next
        : '/statistics';

    if (body.password !== PASSWORD) {
        return NextResponse.json({ ok: false, error: 'Mật khẩu không đúng.' }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, next });
    response.cookies.set(SESSION_COOKIE, SESSION_VALUE, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/'
    });
    return response;
}
