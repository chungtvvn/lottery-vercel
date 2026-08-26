import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'xsmb_session';
const SESSION_VALUE = 'authenticated';

export function proxy(request) {
    const { pathname } = request.nextUrl;

    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon.ico') ||
        pathname.startsWith('/css/') ||
        pathname.startsWith('/js/') ||
        pathname.startsWith('/api/auth/') ||
        pathname.startsWith('/api/prediction/numbers') ||
        pathname.startsWith('/api/prediction/history') ||
        pathname.startsWith('/api/loto/prediction') ||
        pathname.startsWith('/api/milestone-20y/prediction') ||
        pathname.startsWith('/api/daily-advisor') ||
        pathname === '/logout' ||
        pathname === '/login'
    ) {
        return NextResponse.next();
    }

    const session = request.cookies.get(SESSION_COOKIE)?.value;
    if (session === SESSION_VALUE) {
        return NextResponse.next();
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
}

export const config = {
    matcher: ['/((?!.*\\..*).*)']
};
