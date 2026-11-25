'use strict';

/**
 * lib/services/ai5UnifiedService.js
 *
 * KIẾN TRÚC 5 AI MỚI DUY NHẤT (5-SCHOOL ORTHOGONAL DYNAMIC ENGINE v2 · STRICT PIT 100%)
 *
 * Loại bỏ hoàn toàn kiến trúc cũ (cửa sổ tĩnh 100/360 bị lặp cứng 14, 52, 92; nhiễu 1-vote X1;
 * Đề 360 âm vốn và Xiên 4 âm vốn), giữ duy nhất 1 kiến trúc thống nhất rõ tín hiệu cho người dùng:
 *
 * 1. 🔥 Lô Gộp Đa Tầng Thuần (≥ 2 Trường Phái — CHỦ LỰC #1):
 *    - 5 trường phái độc lập: ChatGPT (Markov D-1), Claude (Cầu Vị Trí/Rơi/Lộn),
 *      Gemini (EMA Ngắn), Grok (Weibull Hazard), Muse (Nhịp 60/180 & Lag-2).
 *    - Chỉ đánh số đồng thuận ≥ 2 trường phái (Tầng X5/X4/X3/X2), cắt sạch 100% nhiễu 1-vote.
 *    - Tự động nghỉ (0đ) nếu ngày phân tán 0 số ≥ 2 AI.
 * 2. ⚡ Lô Song Thủ Top 2 Borda (VỐN NHỎ · VUA ROI): 4.4M/kỳ, nổ 1 nháy ăn 8M là lãi ngay.
 * 3. 🎲 Lô Lục Thủ Top 6 Borda Phẳng (ỔN ĐỊNH): 13.2M/kỳ, nổ ≥ 2 nháy có lãi.
 * 4. 🎯 Đề 5 AI Hạt Nhân Giao Thoa (5 AI ∩ TriCore, lọc Anti-Parity): ~3.5M/kỳ, lãi dương 2026.
 *
 * 100% Strict Point-In-Time (Strict PIT): tính trực tiếp từ lịch sử LIVE Cloudflare R2 (T <= D-1),
 * tự động tiến lên ngày dự đoán kế tiếp ngay khi kết quả 18h30 cập nhật.
 */

const { getRawData } = require('../data-access');
const { setLiveDrawsFromRaw, loadCompactDraws } = require('./ai5EnsembleDeService');
const { evaluateDynamicLo5AiDay, SCHOOL_METADATA } = require('./ai5DynamicLoEngine');
const { getDeTinhGonReportAsync, getDeTinhGonReport } = require('./deTinhGonService');
const { summarizeSeries } = require('./bestMethodsService');

const CACHE_TTL_MS = 60 * 1000;
let _cachedPayload = null;
let _cachedAt = 0;
let _cachedDrawSig = '';

const SCHOOL_ORDER = ['chatgpt', 'claude', 'gemini', 'grok', 'muse'];
const SCHOOL_UI = Object.freeze({
    chatgpt: { id: 'chatgpt', name: 'ChatGPT', avatar: '🟢', school: 'Markov D-1 → D', desc: 'Xác suất chuyển tiếp bạc nhớ 27 giải từ kỳ liền trước + khử gan nặng' },
    claude: { id: 'claude', name: 'Claude', avatar: '🟣', school: 'Cầu Vị Trí & Rơi/Lộn', desc: 'Đồ thị cầu vị trí GĐB/G1/G2/G7 + Lô Rơi, Lộn (ab↔ba) & Bóng Dương' },
    gemini: { id: 'gemini', name: 'Gemini', avatar: '✨', school: 'Động Lượng EMA Ngắn', desc: 'Hàm mũ suy giảm nhanh (λ=0.85) + gia tốc L7 vs L30 + bật nhịp ngắn' },
    grok: { id: 'grok', name: 'Grok', avatar: '⚡', school: 'Điểm Rơi Weibull Hazard', desc: 'Xác suất rơi quanh chu kỳ tự nhiên μ_x của từng số (nhịp 1–9 kỳ)' },
    muse: { id: 'muse', name: 'Muse', avatar: '🔮', school: 'Nhịp 60/180 & Lag-2', desc: 'Nhịp trung hạn thích ứng (bỏ loAll 21 năm) + sóng Đầu/Đít + hồi Lag-2' }
});

function pad2(n) {
    return String(n ?? '').padStart(2, '0').slice(-2);
}

function round1(v) {
    return Number((Number(v) || 0).toFixed(1));
}

function addOneDayIso(dateStr) {
    if (!dateStr || dateStr.length < 10) return '';
    const dt = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
    if (Number.isNaN(dt.getTime())) return '';
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
}

function buildCopySyntax(title, groups = []) {
    const lines = [];
    for (const g of groups) {
        if (!g || !Array.isArray(g.numbers) || g.numbers.length === 0) continue;
        lines.push(`${g.prefix ? g.prefix + ': ' : ''}${g.numbers.map(pad2).join(', ')}`);
    }
    return lines.length > 0 ? `${title}\n${lines.join('\n')}` : title;
}

function buildFormDots(chronRows = [], count = 7) {
    return chronRows.slice(-count).map(r => ({
        date: r.date,
        status: r.played === false ? 'SKIP' : (r.isWin ? 'WIN' : 'LOSS'),
        profitM: round1((r.played === false ? 0 : (r.profitK || 0)) / 1000),
        hits: r.hits ?? (r.isHit ? 1 : 0)
    }));
}

function summarizeTimeframes(chronRows = []) {
    return {
        full2026: summarizeSeries(chronRows),
        last30d: summarizeSeries(chronRows.slice(-30)),
        last14d: summarizeSeries(chronRows.slice(-14)),
        last7d: summarizeSeries(chronRows.slice(-7)),
        formDots: buildFormDots(chronRows, 7)
    };
}

/**
 * Tính Radar Tín Hiệu Hội Tụ Lô 5AI (0 - 100) cho 1 ngày cụ thể
 */
function computeLoSignalRadar(ev, prevTop6 = null) {
    const pureNums = ev?.pureNums || [];
    const votesMap = ev?.bordaRank?.votesMap || {};
    const maxVote = pureNums.reduce((m, n) => Math.max(m, votesMap[n]?.count || 0), 0);
    const pureCount = pureNums.length;

    const score = Math.min(
        100,
        (maxVote >= 4 ? 50 : (maxVote === 3 ? 42 : (maxVote === 2 ? 28 : 10))) +
        Math.min(50, pureCount * 11)
    );

    let tier = 'CAUTIOUS';
    let badge = '🛡️ PHÂN TÁN — ĐÁNH NHẸ / NGHỈ';
    let actionLabel = pureCount === 0 ? 'NGHỈ LÔ THUẦN (0Đ)' : `VÀO NHẸ ${pureCount} SỐ ≥2 AI`;
    let reason = pureCount === 0
        ? '5 trường phái hôm nay phân tán hoàn toàn (0 số đạt ≥2 AI) → Nghỉ Lô Đa Tầng Thuần (0đ), có thể tham khảo Song Thủ Top 2 Borda.'
        : `Chỉ có 1 mũi nhọn hội tụ (${pureNums[0]} · ${maxVote}/5 trường phái). Vốn siêu nhẹ ${round1((ev.pureBaseStakeK || 0) / 1000)}M, ưu tiên kết hợp Song Thủ Top 2.`;

    if (maxVote >= 3 || pureCount >= 4) {
        tier = 'STRONG';
        badge = '🔥 TÍN HIỆU MẠNH — HỘI TỤ CAO';
        actionLabel = `VÀO LỆNH ĐỦ ${pureCount} SỐ ≥2 AI`;
        reason = maxVote >= 3
            ? `Hội tụ siêu mạnh ${maxVote}/5 trường phái độc lập (${pureCount} số ≥2 AI · Vốn ${round1((ev.pureBaseStakeK || 0) / 1000)}M). Tín hiệu vào lệnh đẹp!`
            : `Hội tụ rộng ${pureCount} số đồng thuận ≥2 trường phái độc lập (Vốn ${round1((ev.pureBaseStakeK || 0) / 1000)}M). Dòng tín hiệu rất tốt!`;
    } else if (pureCount >= 2) {
        tier = 'STANDARD';
        badge = '⚡ TÍN HIỆU CHUẨN — VÀO LỆNH GỌN';
        actionLabel = `VÀO GỌN ${pureCount} SỐ ≥2 AI`;
        reason = `Có ${pureCount} số đồng thuận ≥2 trường phái độc lập (${pureNums.join(', ')} · Vốn ${round1((ev.pureBaseStakeK || 0) / 1000)}M). Dàn gọn, biên độ rủi ro thấp.`;
    }

    // Độ đổi mới hôm nay so với Top 6 hôm qua (chứng minh chống lặp số cứng 14, 52, 92)
    let freshCount = 6;
    let overlapCount = 0;
    let freshPct = 100;
    const curTop6 = ev?.top6 || [];
    if (Array.isArray(prevTop6) && prevTop6.length > 0 && curTop6.length > 0) {
        const prevSet = new Set(prevTop6);
        overlapCount = curTop6.filter(n => prevSet.has(n)).length;
        freshCount = curTop6.length - overlapCount;
        freshPct = Math.round((freshCount / curTop6.length) * 100);
    }

    // Kèm chi tiết từng số hội tụ do các trường phái nào bầu
    const pureDetails = pureNums.map(num => {
        const v = votesMap[num] || { count: 2, models: [], borda: 0, z: 0 };
        return {
            number: num,
            votes: v.count,
            stakeM: round1((v.count * 2200) / 1000),
            payoutPerHitM: round1((v.count * 8000) / 1000),
            models: v.models || [],
            modelNames: (v.models || []).map(k => SCHOOL_UI[k]?.name || k),
            z: Number((v.z || 0).toFixed(2))
        };
    });

    return {
        score,
        tier,
        badge,
        actionLabel,
        reason,
        maxVote,
        pureCount,
        freshCount,
        overlapCount,
        freshPct,
        pureDetails
    };
}

async function buildUnified5AiPayloadAsync(options = {}) {
    const force = Boolean(options.force);
    const now = Date.now();

    let rawRows = null;
    try {
        rawRows = await getRawData();
    } catch (_) {}

    if (Array.isArray(rawRows) && rawRows.length > 0) {
        setLiveDrawsFromRaw(rawRows);
    }
    const draws = loadCompactDraws();
    const latestDataDate = draws.length > 0 ? String(draws[draws.length - 1][0]).slice(0, 10) : '';
    const drawSig = `${draws.length}:${latestDataDate}`;

    if (!force && _cachedPayload && _cachedDrawSig === drawSig && (now - _cachedAt < CACHE_TTL_MS)) {
        return _cachedPayload;
    }

    // Nạp Đề 5 AI Hạt Nhân (5 AI ∩ TriCore) + Radar Chẵn/Lẻ từ deTinhGonService
    let dtgReport = null;
    try {
        dtgReport = await getDeTinhGonReportAsync({ forceRefresh: force });
    } catch (_) {
        try {
            dtgReport = getDeTinhGonReport({ forceRefresh: false });
        } catch (__) {}
    }

    const dtgByDate = new Map();
    for (const row of (dtgReport?.settledLedger || [])) {
        if (row && row.date) dtgByDate.set(String(row.date).slice(0, 10), row);
    }

    const pureRows = [];
    const top2Rows = [];
    const top6Rows = [];
    const deCoreRows = [];
    const schoolRowsMap = Object.fromEntries(SCHOOL_ORDER.map(k => [k, []]));

    const ledgerAsc = [];
    let cumPureK = 0;
    let cumTop2K = 0;
    let cumTop6K = 0;
    let cumDeCoreK = 0;
    let prevTop6 = null;

    // Rotation telemetry over last 30 settled days
    const recent30Overlaps = [];
    const recent30UniqueSet = new Set();

    // Xác định chỉ mục các kỳ năm 2026
    const indices2026 = [];
    for (let idx = 60; idx < draws.length; idx++) {
        const dStr = String(draws[idx][0] || '').slice(0, 10);
        if (dStr.startsWith('2026')) indices2026.push(idx);
    }
    const recent30StartPos = Math.max(0, indices2026.length - 30);

    for (let pos = 0; pos < indices2026.length; pos++) {
        const idx = indices2026[pos];
        const dStr = String(draws[idx][0]).slice(0, 10);
        const p27Ints = draws[idx][1];
        const p27 = p27Ints.map(pad2);
        const special = p27[0];

        const validDraws = draws.slice(0, idx);
        const ev = evaluateDynamicLo5AiDay(validDraws, p27Ints);
        if (!ev || !ev.settled) continue;

        const signal = computeLoSignalRadar(ev, prevTop6);
        if (pos >= recent30StartPos) {
            if (prevTop6) recent30Overlaps.push(signal.overlapCount);
            ev.top6.forEach(n => recent30UniqueSet.add(n));
        }
        prevTop6 = ev.top6;

        // Đánh giá 5 trường phái độc lập trong ngày
        const p27Counts = {};
        p27.forEach(num => { p27Counts[num] = (p27Counts[num] || 0) + 1; });

        const daySchools = {};
        for (const k of SCHOOL_ORDER) {
            const picks = ev.schoolPicks[k] || [];
            let hits = 0;
            const hitNums = [];
            for (const n of picks) {
                const h = p27Counts[n] || 0;
                hits += h;
                if (h > 0) hitNums.push(n);
            }
            const stakeK = picks.length * 2200;
            const payoutK = hits * 8000;
            const profitK = payoutK - stakeK;
            const sRow = {
                date: dStr,
                played: true,
                isHit: hits > 0,
                isWin: profitK > 0,
                stakeK,
                payoutK,
                profitK,
                hits
            };
            schoolRowsMap[k].push(sRow);
            daySchools[k] = {
                numbers: picks,
                hits,
                hitNums,
                profitM: round1(profitK / 1000),
                isWin: profitK > 0
            };
        }

        // Đề 5 AI Hạt Nhân (5 AI ∩ TriCore)
        const dtgRow = dtgByDate.get(dStr);
        const core = dtgRow?.consensus?.core_intersect || null;
        const dePlayed = Boolean(core && (core.count || 0) > 0);
        const deStakeK = dePlayed ? (core.stakeK || 0) : 0;
        const dePayoutK = dePlayed ? (core.payoutK || 0) : 0;
        const deProfitK = dePlayed ? (core.profitK || 0) : 0;
        const deIsHit = Boolean(dePlayed && core.isHit);
        const deCoreEntry = {
            date: dStr,
            played: dePlayed,
            isHit: deIsHit,
            isWin: dePlayed && deProfitK > 0,
            stakeK: deStakeK,
            payoutK: dePayoutK,
            profitK: deProfitK,
            hits: deIsHit ? 1 : 0,
            count: core?.count || 0,
            numbers: (core?.numbers || []).map(pad2),
            hitNumber: deIsHit ? (core.hitNumber || special) : null
        };

        pureRows.push({
            date: dStr,
            played: ev.pure.played,
            isHit: ev.pure.isHit,
            isWin: ev.pure.isWin,
            stakeK: ev.pure.stakeK,
            payoutK: ev.pure.payoutK,
            profitK: ev.pure.profitK,
            hits: ev.pure.hits
        });
        top2Rows.push({
            date: dStr,
            played: ev.top2Eval.played,
            isHit: ev.top2Eval.isHit,
            isWin: ev.top2Eval.isWin,
            stakeK: ev.top2Eval.stakeK,
            payoutK: ev.top2Eval.payoutK,
            profitK: ev.top2Eval.profitK,
            hits: ev.top2Eval.hits
        });
        top6Rows.push({
            date: dStr,
            played: ev.top6Eval.played,
            isHit: ev.top6Eval.isHit,
            isWin: ev.top6Eval.isWin,
            stakeK: ev.top6Eval.stakeK,
            payoutK: ev.top6Eval.payoutK,
            profitK: ev.top6Eval.profitK,
            hits: ev.top6Eval.hits
        });
        deCoreRows.push(deCoreEntry);

        cumPureK += ev.pure.profitK;
        cumTop2K += ev.top2Eval.profitK;
        cumTop6K += ev.top6Eval.profitK;
        cumDeCoreK += deProfitK;

        ledgerAsc.push({
            date: dStr,
            special,
            prizes27: p27,
            signal: {
                score: signal.score,
                tier: signal.tier,
                pureCount: signal.pureCount,
                maxVote: signal.maxVote,
                freshPct: signal.freshPct
            },
            pure: {
                played: ev.pure.played,
                count: ev.pure.count,
                numbers: ev.pureNums,
                tiers: ev.tiers,
                hits: ev.pure.hits,
                hitNums: ev.pure.hitNums,
                stakeM: round1(ev.pure.stakeK / 1000),
                payoutM: round1(ev.pure.payoutK / 1000),
                profitM: round1(ev.pure.profitK / 1000),
                isHit: ev.pure.isHit,
                isWin: ev.pure.isWin,
                cumProfitM: round1(cumPureK / 1000)
            },
            top2: {
                numbers: ev.top2,
                hits: ev.top2Eval.hits,
                hitNums: ev.top2Eval.hitNums,
                stakeM: round1(ev.top2Eval.stakeK / 1000),
                profitM: round1(ev.top2Eval.profitK / 1000),
                isHit: ev.top2Eval.isHit,
                isWin: ev.top2Eval.isWin,
                cumProfitM: round1(cumTop2K / 1000)
            },
            top6: {
                numbers: ev.top6,
                hits: ev.top6Eval.hits,
                hitNums: ev.top6Eval.hitNums,
                stakeM: round1(ev.top6Eval.stakeK / 1000),
                profitM: round1(ev.top6Eval.profitK / 1000),
                isHit: ev.top6Eval.isHit,
                isWin: ev.top6Eval.isWin,
                cumProfitM: round1(cumTop6K / 1000)
            },
            deCore: {
                played: dePlayed,
                count: deCoreEntry.count,
                numbers: deCoreEntry.numbers,
                isHit: deIsHit,
                hitNumber: deCoreEntry.hitNumber,
                stakeM: round1(deStakeK / 1000),
                profitM: round1(deProfitK / 1000),
                isWin: deCoreEntry.isWin,
                cumProfitM: round1(cumDeCoreK / 1000)
            },
            schools: daySchools
        });
    }

    // DỰ ĐOÁN NGÀY HÔM NAY (NEXT ACTIONABLE TARGET DATE = latestDataDate + 1)
    const targetDate = dtgReport?.today?.targetDate || addOneDayIso(latestDataDate);
    const todayEv = evaluateDynamicLo5AiDay(draws, null);
    const todaySignal = computeLoSignalRadar(todayEv, prevTop6);

    const todayDeCons = dtgReport?.today?.consensus || {};
    const todayDeCoreNums = (todayDeCons.core_intersect?.numbers || todayDeCons.intersect || []).map(pad2);
    const todayParity = dtgReport?.today?.parity || {};

    const todayPureStakeM = round1((todayEv?.pureBaseStakeK || 0) / 1000);
    const pureCopySyntax = (todayEv?.pureNums?.length || 0) === 0
        ? `🛡️ Kỳ ${targetDate}: Lô 5AI Đa Tầng Thuần không có số hội tụ ≥2 trường phái → Nghỉ Lô 0đ.`
        : buildCopySyntax(`🔥 LÔ 5AI ĐA TẦNG THUẦN ≥2 AI (${targetDate} · Vốn ${todayPureStakeM}M):`, [
            { prefix: 'Tầng X5 (500đ/con · 11M)', numbers: todayEv.tiers.x5Nums },
            { prefix: 'Tầng X4 (400đ/con · 8.8M)', numbers: todayEv.tiers.x4Nums },
            { prefix: 'Tầng X3 (300đ/con · 6.6M)', numbers: todayEv.tiers.x3Nums },
            { prefix: 'Tầng X2 (200đ/con · 4.4M)', numbers: todayEv.tiers.x2Nums }
        ]);
    const top2CopySyntax = buildCopySyntax(`⚡ SONG THỦ LÔ 5AI TOP 2 BORDA (${targetDate} · 4.4M):`, [
        { prefix: 'Song Thủ (100đ/con)', numbers: todayEv?.top2 || [] }
    ]);
    const top6CopySyntax = buildCopySyntax(`🎲 LỤC THỦ LÔ 5AI TOP 6 BORDA (${targetDate} · 13.2M):`, [
        { prefix: 'Top 6 (100đ/con)', numbers: todayEv?.top6 || [] }
    ]);
    const deCoreCopySyntax = todayDeCoreNums.length > 0
        ? buildCopySyntax(`🎯 ĐỀ 5AI HẠT NHÂN GIAO THOA (${targetDate} · ${todayDeCoreNums.length}M):`, [
            { prefix: 'Đề 5AI ∩ TriCore (1M/số)', numbers: todayDeCoreNums }
        ])
        : `🛡️ Kỳ ${targetDate}: Không có giao thoa Đề 5AI ∩ TriCore (Nghỉ 0đ).`;

    const allInOneCopySyntax = [
        pureCopySyntax,
        '',
        top2CopySyntax,
        '',
        deCoreCopySyntax
    ].join('\n');

    const pureTf = summarizeTimeframes(pureRows);
    const top2Tf = summarizeTimeframes(top2Rows);
    const top6Tf = summarizeTimeframes(top6Rows);
    const deCoreTf = summarizeTimeframes(deCoreRows);

    const engines = [
        {
            id: 'lo_pure',
            category: 'LO',
            name: '🔥 Lô Gộp Đa Tầng Thuần (≥2 Trường Phái)',
            shortName: 'Lô Đa Tầng Thuần ≥2',
            roleBadge: '👑 Chủ Lực #1 · Cắt Sạch Nhiễu 1-Vote',
            stakeRule: 'TB ~22.7M/kỳ (X2:4.4M · X3:6.6M · X4:8.8M · 0M khi phân tán)',
            ...pureTf,
            today: {
                count: todayEv?.pureNums?.length || 0,
                numbers: todayEv?.pureNums || [],
                tiers: todayEv?.tiers || { x5Nums: [], x4Nums: [], x3Nums: [], x2Nums: [] },
                details: todaySignal.pureDetails,
                stakeM: todayPureStakeM,
                copySyntax: pureCopySyntax
            }
        },
        {
            id: 'lo_top2',
            category: 'LO',
            name: '⚡ Lô Song Thủ Top 2 Borda',
            shortName: 'Song Thủ Top 2 Borda',
            roleBadge: '💎 Vua ROI Vốn Nhỏ · Nổ 1 Nháy Là Lãi',
            stakeRule: '4.4M/kỳ (2 con × 100 điểm · Ăn 8M/nháy)',
            ...top2Tf,
            today: {
                count: todayEv?.top2?.length || 0,
                numbers: todayEv?.top2 || [],
                stakeM: 4.4,
                copySyntax: top2CopySyntax
            }
        },
        {
            id: 'lo_top6',
            category: 'LO',
            name: '🎲 Lô Lục Thủ Top 6 Borda Phẳng',
            shortName: 'Lục Thủ Top 6 Borda',
            roleBadge: '🛡️ Đều Tay Ổn Định · Tỷ Lệ Ngày Lãi Cao Nhất',
            stakeRule: '13.2M/kỳ (6 con × 100 điểm · ≥2 nháy có lãi)',
            ...top6Tf,
            today: {
                count: todayEv?.top6?.length || 0,
                numbers: todayEv?.top6 || [],
                stakeM: 13.2,
                copySyntax: top6CopySyntax
            }
        },
        {
            id: 'de_core',
            category: 'DE',
            name: '🎯 Đề 5 AI Hạt Nhân (5 AI ∩ TriCore)',
            shortName: 'Đề 5AI Hạt Nhân',
            roleBadge: '⭐ Bổ Trợ Đề Vốn Siêu Nhẹ (~3.5M/kỳ)',
            stakeRule: 'Phẳng ~3.5M/kỳ (1M/số · Ăn 84M · Đã lọc Anti-Parity)',
            ...deCoreTf,
            today: {
                count: todayDeCoreNums.length,
                numbers: todayDeCoreNums,
                stakeM: round1(todayDeCoreNums.length),
                copySyntax: deCoreCopySyntax
            }
        }
    ];

    const pureSetToday = new Set(todayEv?.pureNums || []);
    const schools = SCHOOL_ORDER.map(k => {
        const tf = summarizeTimeframes(schoolRowsMap[k]);
        const picks = todayEv?.schoolPicks?.[k] || [];
        return {
            ...SCHOOL_UI[k],
            meta: SCHOOL_METADATA[k],
            ...tf,
            todayNumbers: picks,
            convergedNumbers: picks.filter(n => pureSetToday.has(n))
        };
    });

    const avgOverlap30d = recent30Overlaps.length > 0
        ? Number((recent30Overlaps.reduce((a, b) => a + b, 0) / recent30Overlaps.length).toFixed(2))
        : 2.4;

    const payload = {
        success: true,
        architecture: '5AI_UNIFIED_DYNAMIC_V2',
        architectureLabel: '5 AI Kiến Trúc Mới — 5 Trường Phái Động v2 (Strict PIT)',
        generatedAt: new Date().toISOString(),
        strictPit: true,
        totalHistoricalDraws: draws.length,
        latestDataDate,
        targetDate,
        totalSettled2026: ledgerAsc.length,
        rotationMetrics: {
            avgOverlap30d,
            avgFreshPct30d: Math.round(((6 - avgOverlap30d) / 6) * 100),
            uniqueNumbers30d: recent30UniqueSet.size,
            todayFreshCount: todaySignal.freshCount,
            todayFreshPct: todaySignal.freshPct
        },
        today: {
            targetDate,
            signal: todaySignal,
            pure: engines[0].today,
            top2: engines[1].today,
            top6: engines[2].today,
            deCore: engines[3].today,
            parity: {
                predForm: todayParity.predForm || '--',
                predFormVi: todayParity.predFormVi || '--',
                oppForm: todayParity.oppForm || '--',
                oppFormVi: todayParity.oppFormVi || '--',
                predHeadVi: todayParity.predHeadVi || '--',
                predTailVi: todayParity.predTailVi || '--',
                tacticalAdvice: todayParity.swarmDetails?.tacticalAdvice || ''
            },
            allInOneCopySyntax
        },
        engines,
        schools,
        ledger: ledgerAsc.reverse() // Mới nhất lên đầu
    };

    _cachedPayload = payload;
    _cachedAt = now;
    _cachedDrawSig = drawSig;
    return payload;
}

function clearUnified5AiCache() {
    _cachedPayload = null;
    _cachedAt = 0;
    _cachedDrawSig = '';
}

module.exports = {
    buildUnified5AiPayloadAsync,
    clearUnified5AiCache,
    SCHOOL_UI
};
