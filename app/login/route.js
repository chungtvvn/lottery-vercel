import { NextResponse } from 'next/server';

export async function GET(request) {
    const next = request.nextUrl.searchParams.get('next') || '/statistics';
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/statistics';
    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Đăng nhập | XSMB Stats</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
    <main class="w-full max-w-md rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
        <div class="mb-6">
            <div class="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500 text-xl font-black">X</div>
            <h1 class="text-2xl font-bold">XSMB Stats</h1>
            <p class="mt-1 text-sm text-slate-300">Nhập mật khẩu để truy cập phiên làm việc hiện tại.</p>
        </div>
        <form id="loginForm" class="space-y-4">
            <input type="hidden" name="next" value="${safeNext.replace(/"/g, '&quot;')}">
            <div>
                <label for="password" class="mb-1 block text-sm font-semibold text-slate-200">Mật khẩu</label>
                <input id="password" name="password" type="password" autofocus autocomplete="current-password"
                    class="w-full rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-900 outline-none ring-indigo-400 focus:ring-2">
            </div>
            <div id="error" class="hidden rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-100"></div>
            <button type="submit" class="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-400">Đăng nhập</button>
        </form>
    </main>
    <script>
    document.getElementById('loginForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const error = document.getElementById('error');
        error.classList.add('hidden');
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password: form.password.value,
                next: form.next.value
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
            error.textContent = data.error || 'Mật khẩu không đúng.';
            error.classList.remove('hidden');
            return;
        }
        window.location.href = data.next || '/statistics';
    });
    </script>
</body>
</html>`;
    return new NextResponse(html, {
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store'
        }
    });
}
