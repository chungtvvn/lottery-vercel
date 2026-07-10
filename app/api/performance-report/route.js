import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
};

const PERIOD_KEYS = new Set(['daily', 'weekly', 'monthly']);

function normalizePeriod(value) {
    const key = String(value || 'monthly').trim().toLowerCase();
    return PERIOD_KEYS.has(key) ? key : 'monthly';
}

function pickMethod(section, requestedMethodId) {
    const methods = section?.methods || {};
    if (requestedMethodId) {
        return {
            methodId: requestedMethodId,
            method: methods[requestedMethodId] || null
        };
    }
    const methodId = section?.selectedMethodId || Object.keys(methods)[0] || '';
    return {
        methodId,
        method: methods[methodId] || null
    };
}

function asRatio(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return 0;
    return Math.abs(number) > 1 ? number / 100 : number;
}

function scoreAssessment(summary = {}, type = 'de') {
    const roi = asRatio(summary.roi ?? 0);
    const hitRate = asRatio(summary.hitRate ?? summary.winRate ?? 0);
    const winRate = asRatio(summary.winRate ?? 0);
    const profitK = Number(summary.profitK || 0);
    const longestLoss = Number(summary.longestLoss || 0);

    let level = 'Theo dõi';
    let tone = 'amber';
    if (profitK > 0 && roi >= 0.25 && (type === 'de' ? hitRate >= 0.5 : hitRate >= 0.85)) {
        level = 'Rất tốt';
        tone = 'emerald';
    } else if (profitK > 0 && roi >= 0.08) {
        level = 'Tốt';
        tone = 'green';
    } else if (profitK < 0) {
        level = 'Rủi ro cao';
        tone = 'red';
    }

    const notes = [];
    if (profitK > 0) {
        notes.push(`Profit đang dương ${profitK.toLocaleString('vi-VN')}K, có thể tiếp tục theo dõi như phương án thực chiến.`);
    } else {
        notes.push('Profit đang âm, không nên dùng làm phương án chính nếu chưa có bộ lọc bổ sung.');
    }

    if (type === 'loto') {
        notes.push(`Hit-day ${(hitRate * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}% và win-day ${(winRate * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%, cần ưu tiên độ đều theo tuần.`);
    } else {
        notes.push(`Tỷ lệ trúng ${(hitRate * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%, drawdown dài nhất ${longestLoss} ngày.`);
    }

    if (longestLoss >= 10) {
        notes.push('Chuỗi thua dài cần được coi là rủi ro vận hành khi áp dụng thực tế.');
    }

    return {
        level,
        tone,
        notes
    };
}

function buildResponse(payload, url, requestedType = null) {
    const typeParam = String(url.searchParams.get('type') || 'all').trim().toLowerCase();
    const period = normalizePeriod(url.searchParams.get('period'));
    const methodParam = url.searchParams.get('method') || '';
    const includeTypes = requestedType
        ? [requestedType]
        : (typeParam === 'all'
            ? ['de', 'loto']
            : [typeParam].filter(type => ['de', 'loto'].includes(type)));

    const sections = {};
    for (const type of includeTypes) {
        const section = payload[type];
        const { methodId, method } = pickMethod(section, methodParam);
        if (!method) continue;
        const rows = Array.isArray(method[period]) ? method[period] : [];
        sections[type] = {
            type,
            methodId,
            label: method.label || methodId,
            explanation: method.explanation || '',
            evaluation: method.evaluation || '',
            summary: method.summary || {},
            economics: method.economics || {
                unit: 'K_VND',
                stakePerNumberK: method.stakePerNumberK,
                payoutPerHitK: type === 'de'
                    ? Number(method.stakePerNumberK || 0) * Number(method.payoutMultiplier || 0)
                    : Number(method.payoutMultiplier || 0)
            },
            stakePerNumberK: method.stakePerNumberK,
            payoutPerHitK: type === 'de'
                ? Number(method.stakePerNumberK || 0) * Number(method.payoutMultiplier || 0)
                : Number(method.payoutMultiplier || 0),
            assessment: scoreAssessment(method.summary || {}, type),
            period,
            rows
        };
    }

    return {
        success: true,
        generatedAt: payload.generatedAt,
        latestDataDate: payload.latestDataDate,
        periodRange: payload.period || {},
        source: payload.source || {},
        selectedPeriod: period,
        availablePeriods: ['daily', 'weekly', 'monthly'],
        availableMethods: Object.fromEntries(includeTypes.map(type => [
            type,
            Object.keys(payload[type]?.methods || {})
        ])),
        sections
    };
}

export async function GET(request) {
    try {
        const { loadJsonWithSupabaseFallback } = require('@/lib/data-access');
        const url = new URL(request.url);
        const typeParam = String(url.searchParams.get('type') || 'all').trim().toLowerCase();
        const historyMode = typeParam === 'history';
        const rawPayload = await loadJsonWithSupabaseFallback(historyMode
            ? 'cached_prediction_history_performance_2026.json'
            : 'cached_profit_report_2026.json');
        const payload = historyMode && rawPayload
            ? {
                generatedAt: rawPayload.generatedAt,
                latestDataDate: rawPayload.period?.endDate,
                period: rawPayload.period,
                source: rawPayload.source,
                history: rawPayload
            }
            : rawPayload;
        if (!payload) {
            const cacheName = historyMode
                ? 'cached_prediction_history_performance_2026.json'
                : 'cached_profit_report_2026.json';
            return NextResponse.json(
                {
                    success: false,
                    error: `Chưa có cache báo cáo hiệu quả. Hãy chạy lại action cập nhật dữ liệu để sinh ${cacheName}.`
                },
                { status: 404, headers: NO_STORE_HEADERS }
            );
        }

        return NextResponse.json(
            buildResponse(payload, url, historyMode ? 'history' : null),
            { headers: NO_STORE_HEADERS }
        );
    } catch (error) {
        console.error('[PerformanceReportAPI] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500, headers: NO_STORE_HEADERS }
        );
    }
}
