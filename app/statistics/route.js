import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function GET() {
    const htmlPath = path.join(process.cwd(), 'views', 'statistics.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
