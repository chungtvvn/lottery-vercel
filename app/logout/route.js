import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'xsmb_session';

export async function GET(request) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';

    const response = NextResponse.redirect(loginUrl);
    response.cookies.set(SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0
    });
    return response;
}
