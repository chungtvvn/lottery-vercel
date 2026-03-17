import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const { scoringForms } = require('@/lib/utils/lotteryScoring');
        const formsForClient = scoringForms.map(({ n, description }) => ({ n, description }));
        return NextResponse.json(formsForClient);
    } catch (error) {
        return NextResponse.json({ message: 'Không thể tải danh sách các dạng số.' }, { status: 500 });
    }
}
