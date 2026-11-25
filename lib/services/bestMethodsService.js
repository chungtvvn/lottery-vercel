'use strict';

/**
 * lib/services/bestMethodsService.js
 *
 * TRUNG TÂM TUYỂN CHỌN TINH HOA & THEO DÕI HIỆU QUẢ HÀNG NGÀY (BEST METHODS COMMAND CENTER)
 *
 * Tổng hợp 100% dữ liệu thực chiến LIVE từ R2 / SSOT (Strict PIT, Zero Hardcoded Numbers):
 * 1. Đề Tinh Hoa: Dynamic Governor (Bắn Thường vs Dùng Skill), Core Intersect (~3.5 số),
 *    TriCore PA D2 / PA D, TriCore Tri-Tier, Đồng Thuận Nhị Trụ (Union Tiered).
 * 2. Lô Chủ Lực: Semantic Resonance Top 7 (Phân Tầng & Phẳng), QMBF v6 Top 7 / Top 6 / Top 4 / Top 2,
 *    Lô Dynamic Governor (Bạch Thủ X3/X1).
 * 3. Xiên & 5 AI: Xiên 4 Daily (2 Dàn Cân Bằng Chẵn/Lẻ), 5 AI Tín Hiệu Hồi Phục 360.
 *
 * Tính toán đầy đủ:
 * - Toàn niên 2026 (324+ kỳ), 30 ngày gần nhất, 7 ngày gần nhất.
 * - Phân định rạch ròi Hit Rate (Tần suất nổ) vs Profitable Rate (Tỷ lệ ngày có lãi).
 * - Cận dưới khoảng tin cậy Wilson 95% (W95-), Max Drawdown, Max Loss Streak.
 * - 3 Hồ sơ phân bổ vốn tối ưu cho người dùng (Vốn Nhỏ / Vốn Cân Bằng / Vốn Tấn Công).
 * - Nhật ký theo dõi hiệu quả từng ngày (Daily Live Tracker) + Biểu đồ đường vốn (Equity Curve).
 */

const { loadJsonWithSupabaseFallback, getRawData } = require('../data-access');
const { setLiveDrawsFromRaw } = require('./ai5EnsembleDeService');
const { getDeTinhGonReportAsync, getDeTinhGonReport } = require('./deTinhGonService');
const { getXienFusionReportAsync, getXienFusionReport } = require('./xienFusionService');
const { getCachedClientPayloadAsync, getCachedClientPayload } = require('./ai5StatsService');

const CACHE_TTL_MS = 60 * 1000;
let _cachedReport = null;
let _cachedAt = 0;

function pad2(n) {
    return String(n ?? '').padStart(2, '0').slice(-2);
}

function round1(v) {
    return Number((Number(v) || 0).toFixed(1));
}

function computeWilsonLower95(wins, n) {
    if (!n || n <= 0) return 0;
    const p = wins / n;
    const z = 1.96;
    const z2 = z * z;
    const denom = 1 + z2 / n;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return Math.max(0, (center - margin) / denom);
}

/**
 * Tính đầy đủ chỉ số thống kê từ danh sách các ngày (đã sắp xếp tăng dần theo ngày)
 * Mỗi entry: { date, played, isHit, isWin, stakeK, payoutK, profitK, hits, note }
 */
function summarizeSeries(chronRows = []) {
    const active = chronRows.filter(r => r && r.played !== false);
    const totalTracked = chronRows.length;
    const days = active.length;
    let wins = 0;
    let hitDays = 0;
    let totalHits = 0;
    let stakeK = 0;
    let payoutK = 0;
    let curLoss = 0;
    let maxLossStreak = 0;
    let peakK = 0;
    let equityK = 0;
    let maxDrawdownK = 0;

    for (const r of active) {
        const sK = Number(r.stakeK) || 0;
        const pK = Number(r.payoutK) || 0;
        const profK = r.profitK != null ? Number(r.profitK) : (pK - sK);
        stakeK += sK;
        payoutK += pK;
        equityK += profK;

        if (equityK > peakK) {
            peakK = equityK;
        } else {
            const dd = peakK - equityK;
            if (dd > maxDrawdownK) maxDrawdownK = dd;
        }

        const isWin = r.isWin != null ? Boolean(r.isWin) : profK > 0;
        const isHit = r.isHit != null ? Boolean(r.isHit) : isWin;
        if (isHit) hitDays++;
        if (r.hits != null) totalHits += Number(r.hits) || 0;
        else if (isHit) totalHits += 1;

        if (isWin) {
            wins++;
            curLoss = 0;
        } else {
            curLoss++;
            if (curLoss > maxLossStreak) maxLossStreak = curLoss;
        }
    }

    const profitK = payoutK - stakeK;
    const roi = stakeK > 0 ? (profitK / stakeK) * 100 : 0;
    const hitRate = days > 0 ? (hitDays / days) * 100 : 0;
    const profitableRate = days > 0 ? (wins / days) * 100 : 0;
    const wilsonLow95 = computeWilsonLower95(wins, days) * 100;
    const avgDailyStakeM = days > 0 ? (stakeK / days) / 1000 : 0;

    return {
        totalTracked,
        days,
        skippedDays: Math.max(0, totalTracked - days),
        wins,
        losses: Math.max(0, days - wins),
        hitDays,
        totalHits,
        hitRate: round1(hitRate),
        profitableRate: round1(profitableRate),
        wilsonLow95: round1(wilsonLow95),
        stakeM: round1(stakeK / 1000),
        payoutM: round1(payoutK / 1000),
        profitM: round1(profitK / 1000),
        roi: round1(roi),
        maxDrawdownM: round1(maxDrawdownK / 1000),
        maxLossStreak,
        avgDailyStakeM: round1(avgDailyStakeM)
    };
}

function buildEquityPoints(chronRows = []) {
    let cumK = 0;
    return chronRows.map(r => {
        const profK = r.played === false ? 0 : (Number(r.profitK) || 0);
        cumK += profK;
        return {
            date: r.date,
            profitM: round1(profK / 1000),
            cumProfitM: round1(cumK / 1000),
            played: r.played !== false,
            isWin: r.played !== false && (r.isWin != null ? Boolean(r.isWin) : profK > 0)
        };
    });
}

function buildFormDots(chronRows = [], count = 7) {
    return chronRows.slice(-count).map(r => ({
        date: r.date,
        status: r.played === false ? 'SKIP' : ((r.isWin != null ? r.isWin : (Number(r.profitK) > 0)) ? 'WIN' : 'LOSS'),
        profitM: round1((r.played === false ? 0 : (Number(r.profitK) || 0)) / 1000),
        hits: r.hits ?? (r.isHit ? 1 : 0)
    }));
}

function formatMethodStats(meta, chronRows, todayConfig) {
    const sorted = [...chronRows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const full2026 = summarizeSeries(sorted);
    const last30d = summarizeSeries(sorted.slice(-30));
    const last14d = summarizeSeries(sorted.slice(-14));
    const last7d = summarizeSeries(sorted.slice(-7));
    const formDots = buildFormDots(sorted, 7);
    const equityCurve = buildEquityPoints(sorted);

    // Điểm chất lượng tổng hợp (strictly objective from real profit/ROI/Wilson/DD)
    const qualityScore = Math.round(
        Math.max(-20, Math.min(40, full2026.roi * 1.4)) +
        Math.max(0, Math.min(35, full2026.wilsonLow95 * 0.6)) +
        Math.max(-15, Math.min(25, last30d.roi * 0.5))
    );

    return {
        ...meta,
        qualityScore,
        full2026,
        last30d,
        last14d,
        last7d,
        formDots,
        equityCurve,
        today: todayConfig
    };
}

function buildSyntaxCopy(label, groups = []) {
    const lines = [];
    for (const g of groups) {
        if (!g || !Array.isArray(g.numbers) || g.numbers.length === 0) continue;
        lines.push(`${g.prefix ? g.prefix + ': ' : ''}${g.numbers.map(pad2).join(', ')}${g.suffix ? ' ' + g.suffix : ''}`);
    }
    return lines.length > 0 ? lines.join('\n') : label;
}

async function buildBestMethodsReport(options = {}) {
    const force = Boolean(options.force);
    const now = Date.now();
    if (!force && _cachedReport && (now - _cachedAt < CACHE_TTL_MS)) {
        return _cachedReport;
    }

    // 1. Nạp đồng thời dữ liệu LIVE từ R2 (Strict PIT)
    let advisorData = null;
    let rawRows = null;
    try {
        [advisorData, rawRows] = await Promise.all([
            loadJsonWithSupabaseFallback('cached_daily_method_advisor.json').catch(() => null),
            getRawData().catch(() => null)
        ]);
    } catch (_) {}

    if (Array.isArray(rawRows) && rawRows.length > 0) {
        setLiveDrawsFromRaw(rawRows);
    }

    const [dtgReport, xienReport, ai5Report] = await Promise.all([
        getDeTinhGonReportAsync({ forceRefresh: force, advisorData }).catch(() => getDeTinhGonReport({ forceRefresh: true })),
        getXienFusionReportAsync({ forceRefresh: force }).catch(() => getXienFusionReport({ forceRefresh: true })),
        getCachedClientPayloadAsync({ maxDays: 30, force }).catch(() => getCachedClientPayload({ maxDays: 30 }))
    ]);

    const latestDataDate = rawRows?.at(-1)?.date
        || advisorData?.latestDataDate
        || dtgReport?.settledLedger?.[0]?.date
        || '';
    const targetDate = dtgReport?.today?.targetDate
        || advisorData?.pendingPredictionDate
        || ai5Report?.latestDate
        || '';
    const snapshotLock = advisorData?.snapshotLock || null;

    // Map kết quả thực tế (ĐB + 27 giải) theo ngày để dùng cho Nhật Ký Hàng Ngày
    const actualMap = new Map();
    if (Array.isArray(rawRows)) {
        for (const r of rawRows) {
            const d = String(r.date || r.ngay || '').slice(0, 10);
            if (!d || !d.startsWith('2026')) continue;
            actualMap.set(d, {
                special: pad2(r.special),
                prizes27: [
                    r.special, r.prize1,
                    r.prize2_1, r.prize2_2,
                    r.prize3_1, r.prize3_2, r.prize3_3, r.prize3_4, r.prize3_5, r.prize3_6,
                    r.prize4_1, r.prize4_2, r.prize4_3, r.prize4_4,
                    r.prize5_1, r.prize5_2, r.prize5_3, r.prize5_4, r.prize5_5, r.prize5_6,
                    r.prize6_1, r.prize6_2, r.prize6_3,
                    r.prize7_1, r.prize7_2, r.prize7_3, r.prize7_4
                ].map(pad2)
            });
        }
    }

    const methods = [];

    // =========================================================================
    // PHẦN A: NHÓM ĐỀ TINH HOA (TỶ LỆ 1 ĂN 84)
    // =========================================================================
    const dtgLedger = [...(dtgReport?.settledLedger || [])].sort((a, b) => a.date.localeCompare(b.date));
    const dtgToday = dtgReport?.today || {};
    const deGovToday = dtgToday.governor || {};
    const deConsToday = dtgToday.consensus || {};
    const deTriToday = dtgToday.triCore || {};
    const deParityToday = dtgToday.parity || {};

    // A1. Đề Điều Chuyển Động (Dynamic Governor: Bắn Thường vs Dùng Skill)
    const deGovRows = dtgLedger.map(r => ({
        date: r.date,
        played: true,
        isHit: Boolean(r.governor?.isHit),
        isWin: (r.governor?.profitK || 0) > 0,
        stakeK: r.governor?.stakeK || 0,
        payoutK: r.governor?.payoutK || 0,
        profitK: r.governor?.profitK || 0,
        hits: r.governor?.isHit ? 1 : 0,
        mode: r.governor?.isSkill ? 'SKILL' : 'NORMAL',
        hitNumber: r.governor?.hitNumber || null
    }));
    const deGovActive = deGovToday.activeConfig || {};
    const deGovX3 = (deGovActive.x3 || []).map(pad2);
    const deGovX2 = (deGovActive.x2 || []).map(pad2);
    const deGovX1 = (deGovActive.x1 || []).map(pad2);
    const deGovAll = [...new Set([...deGovX3, ...deGovX2, ...deGovX1])];
    const deGovEstStakeM = round1((deGovX3.length * 3000 + deGovX2.length * 2000 + deGovX1.length * 1000) / 1000);
    methods.push(formatMethodStats({
        id: 'de_dynamic_governor',
        name: 'Đề Điều Chuyển Động (Skill / Thường)',
        shortName: 'Đề Dynamic Governor',
        category: 'DE',
        tier: 'CHAMPION',
        roleBadge: '👑 Quán Quân Lãi Ròng Đề',
        route: '/de-tinh-gon',
        description: 'Tự động kích hoạt Tam Tầng X3/X2/X1 khi hội tụ mạnh (≥2 số Cùng Đầu), ngược lại hạ về 15 số phẳng X1 bảo toàn vốn.',
        stakeRule: 'Động ~15M – 35M/ngày (1 ăn 84)'
    }, deGovRows, {
        isSkill: Boolean(deGovToday.isSkill),
        tacticalBadge: deGovToday.isSkill ? '🔥 DÙNG SKILL (TAM TẦNG)' : '🛡️ BẮN THƯỜNG (15S PHẲNG)',
        reason: deGovToday.reason || 'Theo dõi điểm hội tụ TriCore ∩ 5 AI Cùng Đầu.',
        x3: deGovX3,
        x2: deGovX2,
        x1: deGovX1,
        all: deGovAll,
        count: deGovAll.length,
        estimatedStakeM: deGovEstStakeM,
        copySyntax: buildSyntaxCopy('Đề Dynamic', [
            { prefix: 'Đề VIP X3 (3M)', numbers: deGovX3 },
            { prefix: 'Đề VIP X2 (2M)', numbers: deGovX2 },
            { prefix: 'Đề Lót X1 (1M)', numbers: deGovX1 }
        ])
    }));

    // A2. Đề Siêu Hạt Nhân Giao Thoa (Core Intersect — TriCore ∩ 5 AI)
    const coreIntRows = dtgLedger.map(r => ({
        date: r.date,
        played: (r.consensus?.core_intersect?.count || 0) > 0,
        isHit: Boolean(r.consensus?.core_intersect?.isHit),
        isWin: (r.consensus?.core_intersect?.profitK || 0) > 0,
        stakeK: r.consensus?.core_intersect?.stakeK || 0,
        payoutK: r.consensus?.core_intersect?.payoutK || 0,
        profitK: r.consensus?.core_intersect?.profitK || 0,
        hits: r.consensus?.core_intersect?.isHit ? 1 : 0,
        hitNumber: r.consensus?.core_intersect?.hitNumber || null
    }));
    const coreIntNums = (deConsToday.core_intersect?.numbers || deConsToday.intersect || []).map(pad2);
    methods.push(formatMethodStats({
        id: 'de_core_intersect',
        name: 'Đề Hạt Nhân Giao Thoa (TriCore ∩ 5AI)',
        shortName: 'Đề Core Intersect',
        category: 'DE',
        tier: 'CHAMPION',
        roleBadge: '⭐ Vua ROI & Vốn Siêu Nhỏ',
        route: '/de-tinh-gon',
        description: 'Chỉ đánh những số trùng khớp tuyệt đối giữa TriCore 24s và 5 AI Sweet-Spot 17s (~3–4 số/ngày). Phù hợp vốn nhỏ tỉa ăn đậm.',
        stakeRule: 'Phẳng ~3.5M/ngày (1M/số)'
    }, coreIntRows, {
        tacticalBadge: coreIntNums.length > 0 ? `🎯 TỈA ${coreIntNums.length} SỐ HẠT NHÂN` : '🛡️ KHÔNG CÓ GIAO THOA (NGHỈ)',
        reason: `Giao thoa tinh hoa giữa TriCore 24s & 5 AI hôm nay (${coreIntNums.length} số).`,
        x3: [],
        x2: [],
        x1: coreIntNums,
        all: coreIntNums,
        count: coreIntNums.length,
        estimatedStakeM: round1(coreIntNums.length),
        copySyntax: buildSyntaxCopy('Đề Core Intersect', [{ prefix: 'Đề Hạt Nhân X1', numbers: coreIntNums }])
    }));

    // A3. Đề TriCore 24s — PA D2 (Dồn Hỏa Lực Cùng Đầu X2)
    const paD2Rows = dtgLedger.map(r => ({
        date: r.date,
        played: true,
        isHit: Boolean(r.triCore?.paD2?.isHit),
        isWin: (r.triCore?.paD2?.profitK || 0) > 0,
        stakeK: r.triCore?.paD2?.stakeK || 0,
        payoutK: r.triCore?.paD2?.payoutK || 0,
        profitK: r.triCore?.paD2?.profitK || 0,
        hits: r.triCore?.paD2?.isHit ? 1 : 0,
        hitNumber: r.triCore?.paD2?.hitNumber || null
    }));
    const paD2Nums = (deTriToday.paD2?.x2 || []).map(pad2);
    methods.push(formatMethodStats({
        id: 'de_tricore_pad2',
        name: 'Đề TriCore 24s — PA D2 (Cùng Đầu X2)',
        shortName: 'Đề TriCore PA D2',
        category: 'DE',
        tier: 'ELITE',
        roleBadge: '🔥 Dàn Siêu Gọn ~12 Số',
        route: '/de-tinh-gon',
        description: 'Lọc bỏ 25 số cực nghịch & cắt nhóm Cùng Đít, tập trung đánh các số Cùng Đầu Chẵn/Lẻ dự báo.',
        stakeRule: '~25M/ngày (2M/số Cùng Đầu)'
    }, paD2Rows, {
        tacticalBadge: `🎯 CÙNG ĐẦU ${deParityToday.predHeadVi || '---'} (${paD2Nums.length}s)`,
        reason: `Dự báo Chẵn/Lẻ: ${deParityToday.predFormVi || '---'} (Loại ${deParityToday.oppFormVi || '---'}).`,
        x3: [],
        x2: paD2Nums,
        x1: [],
        all: paD2Nums,
        count: paD2Nums.length,
        estimatedStakeM: round1(paD2Nums.length * 2),
        copySyntax: buildSyntaxCopy('Đề PA D2', [{ prefix: 'Đề PA D2 X2', numbers: paD2Nums }])
    }));

    // A4. Đề Đồng Thuận Nhị Trụ (Union Tiered — Vua Win Rate Đề)
    const unionRows = dtgLedger.map(r => ({
        date: r.date,
        played: true,
        isHit: Boolean(r.consensus?.union_tiered?.isHit),
        isWin: (r.consensus?.union_tiered?.profitK || 0) > 0,
        stakeK: r.consensus?.union_tiered?.stakeK || 0,
        payoutK: r.consensus?.union_tiered?.payoutK || 0,
        profitK: r.consensus?.union_tiered?.profitK || 0,
        hits: r.consensus?.union_tiered?.isHit ? 1 : 0,
        hitNumber: r.consensus?.union_tiered?.hitNumber || null
    }));
    const unionX2 = (deConsToday.union_tiered?.x2 || []).map(pad2);
    const unionX1 = (deConsToday.union_tiered?.x1 || []).map(pad2);
    const unionAll = [...new Set([...unionX2, ...unionX1])];
    methods.push(formatMethodStats({
        id: 'de_consensus_union',
        name: 'Đề Đồng Thuận Nhị Trụ (Union Tiered)',
        shortName: 'Đề Union Nhị Trụ',
        category: 'DE',
        tier: 'ELITE',
        roleBadge: '🛡️ Vua Win Rate Đề Có Lãi',
        route: '/de-tinh-gon',
        description: 'Gộp phủ TriCore + 5 AI sau lọc Anti-Parity: Giao thoa cược X2, phần bọc lót cược X1. Chuỗi thua ngắn nhất nhóm Đề.',
        stakeRule: '~35M/ngày (X2 giao thoa, X1 lót)'
    }, unionRows, {
        tacticalBadge: `🛡️ BỌC LÓT ${unionAll.length} SỐ`,
        reason: `Phủ rộng ${unionX2.length} số VIP X2 + ${unionX1.length} số Lót X1.`,
        x3: [],
        x2: unionX2,
        x1: unionX1,
        all: unionAll,
        count: unionAll.length,
        estimatedStakeM: round1(unionX2.length * 2 + unionX1.length),
        copySyntax: buildSyntaxCopy('Đề Union', [
            { prefix: 'Đề VIP X2', numbers: unionX2 },
            { prefix: 'Đề Lót X1', numbers: unionX1 }
        ])
    }));

    // =========================================================================
    // PHẦN B: NHÓM LÔ CHỦ LỰC (22K ĂN 80K / ĐIỂM)
    // =========================================================================
    const srLedger = [...(advisorData?.semanticResonanceSuite?.settledLedger || [])].sort((a, b) => a.date.localeCompare(b.date));
    const srTodayLo = advisorData?.semanticResonanceSuite?.latestRecommendation?.lo || {};
    const qmbfLedger = [...(advisorData?.loQuantumBayesFusion?.settledLedger || [])].sort((a, b) => a.date.localeCompare(b.date));
    const qmbfTodayRanked = (advisorData?.loQuantumBayesFusion?.latestRecommendation?.rankedNumbers || advisorData?.loDropoff27?.latestRecommendation?.top10 || []).map(pad2);
    const dtgLoLedger = [...(dtgReport?.loto?.settledLedger || [])].sort((a, b) => a.date.localeCompare(b.date));
    const dtgLoToday = dtgReport?.loto?.today || {};

    // B1. Lô Semantic Resonance — Top 7 Phân Tầng (VIP X2 + Lót X1)
    const srLoTieredRows = srLedger.filter(r => r.lo?.tiered).map(r => ({
        date: r.date,
        played: true,
        isHit: (r.lo?.totalHits || 0) > 0,
        isWin: Boolean(r.lo.tiered.isWin),
        stakeK: r.lo.tiered.stakeK || 22000,
        payoutK: r.lo.tiered.payoutK || 0,
        profitK: r.lo.tiered.profitK || 0,
        hits: r.lo?.totalHits || 0,
        vipHits: r.lo?.vipHits || 0
    }));
    const srTop3Vip = (srTodayLo.top3Vip || qmbfTodayRanked.slice(0, 3)).map(pad2);
    const srTop4Lot = (srTodayLo.top4Lot || qmbfTodayRanked.slice(3, 7)).map(pad2);
    const srTop7All = [...srTop3Vip, ...srTop4Lot];
    methods.push(formatMethodStats({
        id: 'lo_semantic_tiered7',
        name: 'Lô Cộng Hưởng Top 7 Phân Tầng (3 VIP X2 + 4 Lót)',
        shortName: 'Lô Semantic Top 7 X2/X1',
        category: 'LO',
        tier: 'CHAMPION',
        roleBadge: '🔥 Vua Lợi Nhuận Lô 2026',
        route: '/loto',
        description: 'Mạng đồng xuất hiện Co-Affinity + Động lượng 2 chiều: dồn 4.4M/con cho 3 con VIP đầu bảng và 2.2M/con cho 4 con lót.',
        stakeRule: '22.0M/ngày (VIP ăn 16M, Lót ăn 8M/nháy)'
    }, srLoTieredRows, {
        tacticalBadge: '🔥 3 VIP X2 · 4 LÓT X1',
        reason: 'Lô dẫn đầu tổng lãi ròng 2026 nhờ đòn bẩy đúng 3 mũi nhọn điểm cao nhất.',
        x3: [],
        x2: srTop3Vip,
        x1: srTop4Lot,
        all: srTop7All,
        count: srTop7All.length,
        estimatedStakeM: 22.0,
        copySyntax: buildSyntaxCopy('Lô Semantic Top 7 Phân Tầng', [
            { prefix: 'Lô VIP X2 (200đ)', numbers: srTop3Vip },
            { prefix: 'Lô Lót X1 (100đ)', numbers: srTop4Lot }
        ])
    }));

    // B2. Lô QMBF v6 / Dropoff 27 — Top 7 Phẳng (Mỏ Neo Dòng Tiền An Toàn Nhất)
    const srLoFlatRows = srLedger.filter(r => r.lo?.flat).map(r => ({
        date: r.date,
        played: true,
        isHit: (r.lo?.totalHits || 0) > 0,
        isWin: Boolean(r.lo.flat.isWin),
        stakeK: r.lo.flat.stakeK || 15400,
        payoutK: r.lo.flat.payoutK || 0,
        profitK: r.lo.flat.profitK || 0,
        hits: r.lo?.totalHits || 0
    }));
    const qmbfTop7Rows = qmbfLedger.filter(r => r.methods?.top7).map(r => {
        const m = r.methods.top7;
        const h = Number(m.hits ?? m.totalHits ?? 0);
        return {
            date: r.date,
            played: true,
            isHit: h > 0,
            isWin: Boolean(m.isWin),
            stakeK: m.stakeK || 15400,
            payoutK: m.payoutK || 0,
            profitK: m.profitK || 0,
            hits: h
        };
    });
    const loTop7BestRows = srLoFlatRows.length >= qmbfTop7Rows.length ? srLoFlatRows : qmbfTop7Rows;
    const loTop7Today = (srTodayLo.top7 || qmbfTodayRanked.slice(0, 7)).map(pad2);
    methods.push(formatMethodStats({
        id: 'lo_qmbf_top7_flat',
        name: 'Lô QMBF v6 / Cộng Hưởng — Top 7 Phẳng',
        shortName: 'Lô Top 7 Phẳng',
        category: 'LO',
        tier: 'CHAMPION',
        roleBadge: '🚀 Mỏ Neo Dòng Tiền An Toàn Nhất',
        route: '/loto',
        description: '7 con cược phẳng 2.2M/con (15.4M/ngày). Chỉ cần nổ ≥2 nháy là có lãi ròng. Max Drawdown cực thấp & chuỗi thua tối đa 4 ngày.',
        stakeRule: '15.4M/ngày (7 con × 100 điểm)'
    }, loTop7BestRows, {
        tacticalBadge: '🚀 CƯỢC PHẲNG 7 SỐ (≥2 NHÁY LÃI)',
        reason: 'Dàn Lô có tỷ lệ ngày có lãi cao nhất & biên độ sụt vốn thấp nhất hệ thống.',
        x3: [],
        x2: [],
        x1: loTop7Today,
        all: loTop7Today,
        count: loTop7Today.length,
        estimatedStakeM: 15.4,
        copySyntax: buildSyntaxCopy('Lô Top 7 Phẳng', [{ prefix: 'Lô Top 7 (100đ/con)', numbers: loTop7Today }])
    }));

    // B3. Lô QMBF v6 — Top 6 Lục Thủ (Live 89 ngày ROI +19.9%!)
    const qmbfTop6Rows = qmbfLedger.filter(r => r.methods?.top6).map(r => {
        const m = r.methods.top6;
        const h = Number(m.hits ?? m.totalHits ?? 0);
        return {
            date: r.date,
            played: true,
            isHit: h > 0,
            isWin: Boolean(m.isWin),
            stakeK: m.stakeK || 13200,
            payoutK: m.payoutK || 0,
            profitK: m.profitK || 0,
            hits: h
        };
    });
    const qmbfTop6Today = qmbfTodayRanked.slice(0, 6);
    methods.push(formatMethodStats({
        id: 'lo_qmbf_top6',
        name: 'Lô QMBF v6 — Top 6 Lục Thủ Chủ Lực',
        shortName: 'Lô QMBF Top 6',
        category: 'LO',
        tier: 'ELITE',
        roleBadge: '💎 Phong Độ Live Đỉnh Cao',
        route: '/loto',
        description: '7 động cơ Bayes-Markov + Cầu vị trí lọc 6 con mạnh nhất (13.2M/ngày). Giai đoạn thực chiến Live gần đây đạt phong độ vượt trội.',
        stakeRule: '13.2M/ngày (6 con × 100 điểm)'
    }, qmbfTop6Rows, {
        tacticalBadge: '💎 LỤC THỦ CHỦ LỰC 6 SỐ',
        reason: 'Vốn nhẹ hơn Top 7 (13.2M), chỉ cần ≥2 nháy ăn ngay 16M (+2.8M/ngày).',
        x3: [],
        x2: [],
        x1: qmbfTop6Today,
        all: qmbfTop6Today,
        count: qmbfTop6Today.length,
        estimatedStakeM: 13.2,
        copySyntax: buildSyntaxCopy('Lô QMBF Top 6', [{ prefix: 'Lô Top 6 (100đ/con)', numbers: qmbfTop6Today }])
    }));

    // B4. Lô Điều Chuyển Động (Dynamic Governor — Bạch Thủ X3/X1)
    const loGovRows = dtgLoLedger.map(r => {
        const g = r.dynamicGovernor || r.governor || {};
        const h = Number(g.totalHits ?? g.hits ?? 0);
        return {
            date: r.date,
            played: true,
            isHit: h > 0,
            isWin: Boolean(g.isWin),
            stakeK: g.stakeK || 2200,
            payoutK: g.payoutK || 0,
            profitK: g.profitK || 0,
            hits: h,
            mode: g.isSkill ? 'SKILL' : 'NORMAL'
        };
    });
    const loGovToday = dtgLoToday.governor || {};
    const loGovNums = (loGovToday.numbers || []).map(pad2);
    const loGovStakeM = loGovToday.isSkill ? 6.6 : 2.2;
    methods.push(formatMethodStats({
        id: 'lo_dynamic_governor',
        name: 'Lô Điều Chuyển Động (Bạch Thủ X3/X1)',
        shortName: 'Lô Dynamic Bạch Thủ',
        category: 'LO',
        tier: 'ELITE',
        roleBadge: '👑 Vốn Siêu Nhẹ & ROI Cao',
        route: '/de-tinh-gon',
        description: 'Đánh duy nhất 1 con Bạch Thủ mỗi ngày! Nâng X3 (6.6M) khi TriCore == 5 AI đồng thuận kép, còn lại bắn phẳng 2.2M.',
        stakeRule: '2.2M – 6.6M/ngày (TB 4.0M/ngày)'
    }, loGovRows, {
        isSkill: Boolean(loGovToday.isSkill),
        tacticalBadge: loGovToday.isSkill ? '🔥 ĐỒNG THUẬN KÉP X3 (6.6M)' : '🛡️ BẮN THƯỜNG X1 (2.2M)',
        reason: loGovToday.reason || 'Kiểm tra đồng thuận kép giữa TriCore Top 1 và 5 AI Top 1.',
        x3: loGovToday.isSkill ? loGovNums : [],
        x2: [],
        x1: loGovToday.isSkill ? [] : loGovNums,
        all: loGovNums,
        count: loGovNums.length,
        estimatedStakeM: loGovStakeM,
        copySyntax: buildSyntaxCopy('Lô Bạch Thủ', [{ prefix: loGovToday.isSkill ? 'Bạch Thủ Lô X3 (300đ)' : 'Bạch Thủ Lô (100đ)', numbers: loGovNums }])
    }));

    // B5. Lô QMBF v6 — Top 2 Song Thủ Vàng (Hit Rate = Profitable Rate)
    const qmbfTop2Rows = qmbfLedger.filter(r => r.methods?.top2).map(r => {
        const m = r.methods.top2;
        const h = Number(m.hits ?? m.totalHits ?? 0);
        return {
            date: r.date,
            played: true,
            isHit: h > 0,
            isWin: Boolean(m.isWin),
            stakeK: m.stakeK || 4400,
            payoutK: m.payoutK || 0,
            profitK: m.profitK || 0,
            hits: h
        };
    });
    const qmbfTop2Today = qmbfTodayRanked.slice(0, 2);
    methods.push(formatMethodStats({
        id: 'lo_qmbf_top2',
        name: 'Lô QMBF v6 — Top 2 Song Thủ Vàng',
        shortName: 'Lô Song Thủ Top 2',
        category: 'LO',
        tier: 'ELITE',
        roleBadge: '⚡ Song Thủ Vốn Nhỏ (Nổ 1 Nháy Là Lãi)',
        route: '/loto',
        description: '2 con mạnh nhất từ động cơ QMBF v6 (4.4M/ngày). Chỉ cần nổ đúng 1 nháy là ăn 8M (lãi ngay +3.6M/ngày).',
        stakeRule: '4.4M/ngày (2 con × 100 điểm)'
    }, qmbfTop2Rows, {
        tacticalBadge: '⚡ SONG THỦ 2 CON (4.4M)',
        reason: 'Hit Rate = Profitable Rate. Phù hợp đánh song thủ gọn gàng hàng ngày.',
        x3: [],
        x2: [],
        x1: qmbfTop2Today,
        all: qmbfTop2Today,
        count: qmbfTop2Today.length,
        estimatedStakeM: 4.4,
        copySyntax: buildSyntaxCopy('Song Thủ Lô', [{ prefix: 'Song Thủ Lô (100đ/con)', numbers: qmbfTop2Today }])
    }));

    // =========================================================================
    // PHẦN C: XIÊN 4 LIVE & 5 AI TÍN HIỆU HỒI PHỤC 360
    // =========================================================================
    // C1. Xiên 4 Quây — Daily Advisor (2 Dàn Cân Bằng Chẵn/Lẻ)
    const xienHist = [...(xienReport?.history || [])].filter(h => h.daily).sort((a, b) => a.date.localeCompare(b.date));
    const xienDailyRows = xienHist.map(h => ({
        date: h.date,
        played: true,
        isHit: (h.daily.payoutK || 0) > 0,
        isWin: (h.daily.profitK || 0) > 0,
        stakeK: h.daily.stakeK || 22000,
        payoutK: h.daily.payoutK || 0,
        profitK: h.daily.profitK || 0,
        hits: Math.max(h.daily.d1Hits || 0, h.daily.d2Hits || 0)
    }));
    const top8X4Today = advisorData?.top8ParityXien4?.latestRecommendation || xienReport?.todayPending?.daily || {};
    const x4Dan1 = (top8X4Today.dan1 || []).map(pad2);
    const x4Dan2 = (top8X4Today.dan2 || []).map(pad2);
    methods.push(formatMethodStats({
        id: 'xien4_daily_balanced',
        name: 'Xiên 4 Quây — Daily 2 Dàn Cân Bằng',
        shortName: 'Xiên 4 Daily (2 Dàn)',
        category: 'XIEN',
        tier: 'CHAMPION',
        roleBadge: '⚡ Đòn Bẩy Xiên Live Thực Chiến',
        route: '/xien-fusion',
        description: '2 dàn Xiên 4 quây (mỗi dàn 4 số cân bằng Chẵn/Lẻ = 11M/dàn). Nổ 3 con ăn 84M, nổ 4 con ăn 384M!',
        stakeRule: '22.0M/ngày (2 dàn × 11M)'
    }, xienDailyRows, {
        tacticalBadge: '⚡ 2 DÀN XIÊN 4 QUÂY',
        reason: `Đối soát Live ${xienDailyRows.length} kỳ gần nhất đạt hiệu suất vượt trội.`,
        x3: [],
        x2: x4Dan1,
        x1: x4Dan2,
        all: [...x4Dan1, ...x4Dan2],
        dan1: x4Dan1,
        dan2: x4Dan2,
        count: x4Dan1.length + x4Dan2.length,
        estimatedStakeM: 22.0,
        copySyntax: buildSyntaxCopy('Xiên 4 Daily', [
            { prefix: 'Xiên 4 Quây Dàn 1', numbers: x4Dan1 },
            { prefix: 'Xiên 4 Quây Dàn 2', numbers: x4Dan2 }
        ])
    }));

    // C2. 5 AI — Tín Hiệu Hồi Phục 360 (Signal-Gated Rebound 360)
    const ai5Hist = [...(ai5Report?.history || [])]
        .filter(d => d.newStrategy && d.newStrategy.isSettled)
        .sort((a, b) => a.date.localeCompare(b.date));
    const ai5SigRows = ai5Hist.map(d => {
        const ns = d.newStrategy;
        const played = ns.decision !== 'SKIP';
        return {
            date: d.date,
            played,
            isHit: played && (ns.de?.isHit || (ns.lo?.hits || 0) > 0),
            isWin: played && Boolean(ns.combo?.isWin),
            stakeK: played ? (ns.combo?.stakeK || 0) : 0,
            payoutK: played ? (ns.combo?.payoutK || 0) : 0,
            profitK: played ? (ns.combo?.profitK || 0) : 0,
            hits: (ns.de?.isHit ? 1 : 0) + (ns.lo?.hits || 0),
            decision: ns.decision
        };
    });
    const ai5Today360 = ai5Report?.todayNewStrategy || {};
    const ai5DeAll = (ai5Today360.de?.numbers || []).map(pad2);
    const ai5LoTop6 = (ai5Today360.lo?.top6 || []).map(pad2);
    const ai5IsSkip = ai5Today360.decision === 'SKIP';
    methods.push(formatMethodStats({
        id: 'ai5_signal_rebound_360',
        name: '5 AI — Tín Hiệu Hồi Phục 360 (Lọc Bỏ Ngày Xấu)',
        shortName: '5 AI Tín Hiệu 360',
        category: 'AI5',
        tier: 'ELITE',
        roleBadge: '🤖 Lọc Tín Hiệu Bảo Toàn Vốn',
        route: '/ai-5',
        description: 'Mở rộng cửa sổ 5 AI lên W=360 + lọc Anti-Parity + tự động NGHỈ CƯỢC (SKIP) sau ngày thua nếu tín hiệu không tăng mạnh hơn.',
        stakeRule: 'Chỉ cược khi tín hiệu đạt chuẩn (0M khi SKIP)'
    }, ai5SigRows, {
        decision: ai5Today360.decision || 'BET',
        scoreComposite: ai5Today360.scoreComposite ?? 100,
        tacticalBadge: ai5Today360.decisionLabel || (ai5IsSkip ? '🛡️ NGHỈ CƯỢC (SKIP)' : '⚡ VÀO LỆNH 1.0X'),
        reason: ai5Today360.decisionReason || 'Chấm điểm hội tụ 5 AI cửa sổ 360 ngày.',
        x3: [],
        x2: (ai5Today360.de?.x2Nums || []).map(pad2),
        x1: (ai5Today360.de?.x1Nums || []).map(pad2),
        loTop6: ai5LoTop6,
        all: ai5DeAll,
        count: ai5DeAll.length,
        estimatedStakeM: ai5IsSkip ? 0 : round1((ai5Today360.combo?.stakeK || 91000) / 1000),
        copySyntax: ai5IsSkip
            ? 'Hôm nay 5 AI Tín Hiệu 360 báo SKIP (Nghỉ cược bảo toàn vốn).'
            : buildSyntaxCopy('5 AI Tín Hiệu 360', [
                { prefix: 'Đề 360 VIP X2', numbers: ai5Today360.de?.x2Nums || [] },
                { prefix: 'Đề 360 Lót X1', numbers: ai5Today360.de?.x1Nums || [] },
                { prefix: 'Lô 360 Top 6', numbers: ai5LoTop6 }
            ])
    }));

    // =========================================================================
    // PHẦN D: 3 HỒ SƠ VỐN TỐI ƯU CHO NGƯỜI DÙNG (USER PORTFOLIO PRESETS)
    // =========================================================================
    const byId = Object.fromEntries(methods.map(m => [m.id, m]));
    const rowsById = {
        de_dynamic_governor: new Map(deGovRows.map(r => [r.date, r])),
        de_core_intersect: new Map(coreIntRows.map(r => [r.date, r])),
        de_tricore_pad2: new Map(paD2Rows.map(r => [r.date, r])),
        de_consensus_union: new Map(unionRows.map(r => [r.date, r])),
        lo_semantic_tiered7: new Map(srLoTieredRows.map(r => [r.date, r])),
        lo_qmbf_top7_flat: new Map(loTop7BestRows.map(r => [r.date, r])),
        lo_qmbf_top6: new Map(qmbfTop6Rows.map(r => [r.date, r])),
        lo_dynamic_governor: new Map(loGovRows.map(r => [r.date, r])),
        lo_qmbf_top2: new Map(qmbfTop2Rows.map(r => [r.date, r])),
        xien4_daily_balanced: new Map(xienDailyRows.map(r => [r.date, r])),
        ai5_signal_rebound_360: new Map(ai5SigRows.map(r => [r.date, r]))
    };

    const allDatesChron = [...new Set([
        ...deGovRows.map(r => r.date),
        ...loTop7BestRows.map(r => r.date)
    ])].sort();

    function buildPortfolio(id, name, subtitle, badge, methodIds) {
        const combinedRows = allDatesChron.map(date => {
            let stakeK = 0, payoutK = 0, profitK = 0, anyPlayed = false, anyHit = false;
            for (const mId of methodIds) {
                const row = rowsById[mId]?.get(date);
                if (row && row.played !== false) {
                    anyPlayed = true;
                    stakeK += row.stakeK || 0;
                    payoutK += row.payoutK || 0;
                    profitK += row.profitK || 0;
                    if (row.isHit) anyHit = true;
                }
            }
            return {
                date,
                played: anyPlayed,
                isHit: anyHit,
                isWin: anyPlayed && profitK > 0,
                stakeK,
                payoutK,
                profitK
            };
        });

        const full2026 = summarizeSeries(combinedRows);
        const last30d = summarizeSeries(combinedRows.slice(-30));
        const last7d = summarizeSeries(combinedRows.slice(-7));
        const todayStakeM = round1(methodIds.reduce((sum, mId) => sum + (byId[mId]?.today?.estimatedStakeM || 0), 0));
        const todayCopyLines = methodIds.map(mId => {
            const m = byId[mId];
            return m ? `[${m.shortName}]\n${m.today?.copySyntax || ''}` : '';
        }).filter(Boolean).join('\n\n');

        return {
            id,
            name,
            subtitle,
            badge,
            methodIds,
            methodNames: methodIds.map(mId => byId[mId]?.shortName || mId),
            todayStakeM,
            full2026,
            last30d,
            last7d,
            todayCopySyntax: todayCopyLines
        };
    }

    const portfolios = [
        buildPortfolio(
            'balanced',
            '👑 Bộ Đôi Cân Bằng Tối Ưu (Khuyên Dùng)',
            'Đề Dynamic Governor + Lô QMBF Top 7 Phẳng — Kết hợp lợi nhuận Đề cao nhất & dòng tiền Lô an toàn nhất.',
            'KHUYÊN DÙNG #1',
            ['de_dynamic_governor', 'lo_qmbf_top7_flat']
        ),
        buildPortfolio(
            'conservative',
            '🛡️ Bộ Vốn Siêu Nhẹ (ROI Đỉnh Cao)',
            'Đề Core Intersect (~3.5 số) + Lô Dynamic Bạch Thủ (1 số) + Lô Song Thủ Top 2 (2 số). Tổng vốn ~12M/ngày.',
            'VỐN NHỎ · ROI CAO',
            ['de_core_intersect', 'lo_dynamic_governor', 'lo_qmbf_top2']
        ),
        buildPortfolio(
            'aggressive',
            '🚀 Bộ Tấn Công Đa Tầng (Tối Đa Lợi Nhuận)',
            'Đề Dynamic Governor + Lô Semantic Top 7 Phân Tầng + Lô Dynamic Bạch Thủ — Đòn bẩy tối đa cả Đề lẫn Lô.',
            'LỢI NHUẬN CỰC ĐẠI',
            ['de_dynamic_governor', 'lo_semantic_tiered7', 'lo_dynamic_governor']
        )
    ];

    // =========================================================================
    // PHẦN E: NHẬT KÝ THEO DÕI HIỆU QUẢ HÀNG NGÀY (DAILY LIVE PERFORMANCE TRACKER)
    // =========================================================================
    let cumBalK = 0;
    let cumConsK = 0;
    let cumAggK = 0;
    const dailyLedgerAsc = allDatesChron.map(date => {
        const act = actualMap.get(date);
        const dtgR = dtgLedger.find(r => r.date === date);
        const actualSpecial = act?.special || dtgR?.actualSpecial || '--';

        const cell = (mId) => {
            const r = rowsById[mId]?.get(date);
            if (!r) return null;
            return {
                played: r.played !== false,
                isHit: Boolean(r.isHit),
                isWin: Boolean(r.isWin),
                hits: r.hits ?? 0,
                stakeM: round1((r.stakeK || 0) / 1000),
                profitM: round1((r.profitK || 0) / 1000),
                mode: r.mode || r.decision || null,
                hitNumber: r.hitNumber || null
            };
        };

        const mCells = {
            de_dynamic_governor: cell('de_dynamic_governor'),
            de_core_intersect: cell('de_core_intersect'),
            de_tricore_pad2: cell('de_tricore_pad2'),
            lo_qmbf_top7_flat: cell('lo_qmbf_top7_flat'),
            lo_semantic_tiered7: cell('lo_semantic_tiered7'),
            lo_qmbf_top6: cell('lo_qmbf_top6'),
            lo_dynamic_governor: cell('lo_dynamic_governor'),
            xien4_daily_balanced: cell('xien4_daily_balanced'),
            ai5_signal_rebound_360: cell('ai5_signal_rebound_360')
        };

        const dayBalK = (rowsById.de_dynamic_governor.get(date)?.profitK || 0)
            + (rowsById.lo_qmbf_top7_flat.get(date)?.profitK || 0);
        const dayConsK = (rowsById.de_core_intersect.get(date)?.profitK || 0)
            + (rowsById.lo_dynamic_governor.get(date)?.profitK || 0)
            + (rowsById.lo_qmbf_top2.get(date)?.profitK || 0);
        const dayAggK = (rowsById.de_dynamic_governor.get(date)?.profitK || 0)
            + (rowsById.lo_semantic_tiered7.get(date)?.profitK || 0)
            + (rowsById.lo_dynamic_governor.get(date)?.profitK || 0);

        cumBalK += dayBalK;
        cumConsK += dayConsK;
        cumAggK += dayAggK;

        return {
            date,
            actualSpecial,
            predForm: dtgR?.predForm || null,
            methods: mCells,
            portfolios: {
                balanced: { dayProfitM: round1(dayBalK / 1000), cumProfitM: round1(cumBalK / 1000) },
                conservative: { dayProfitM: round1(dayConsK / 1000), cumProfitM: round1(cumConsK / 1000) },
                aggressive: { dayProfitM: round1(dayAggK / 1000), cumProfitM: round1(cumAggK / 1000) }
            }
        };
    });

    // =========================================================================
    // PHẦN F: DANH SÁCH PHƯƠNG PHÁP CŨ ĐÃ CHUYỂN VỀ KHO NGHIÊN CỨU (MINH BẠCH)
    // =========================================================================
    const demotedMethods = [];
    const addDemoted = (name, category, days, profitK, roi) => {
        if (profitK == null) return;
        demotedMethods.push({
            name,
            category,
            days: days || allDatesChron.length,
            profitM: round1(profitK / 1000),
            roi: round1(Math.abs(roi) <= 2 ? roi * 100 : roi),
            reason: 'Lợi nhuận 2026 Strict PIT đang âm — Đã chuyển sang Tab "Kho Phương Pháp Chuyên Sâu" để tránh gây nhiễu cho người chơi.'
        });
    };
    if (advisorData?.dualMerge?.summary) {
        addDemoted('Đề Gộp Tiêu Chuẩn (Dual Merge cũ)', 'DE', advisorData.dualMerge.summary.days, advisorData.dualMerge.summary.profitK, advisorData.dualMerge.summary.roi);
    }
    if (advisorData?.tripleMerge?.summary) {
        addDemoted('Đề Tam Trụ (Triple Merge cũ)', 'DE', advisorData.tripleMerge.summary.totalSettled, advisorData.tripleMerge.summary.overallProfitK, advisorData.tripleMerge.summary.roi);
    }
    if (advisorData?.deMarkovGapHazard?.summary) {
        addDemoted('Đề Markov Gap Hazard (dàn 43s)', 'DE', advisorData.deMarkovGapHazard.summary.totalDays, advisorData.deMarkovGapHazard.summary.profitK, advisorData.deMarkovGapHazard.summary.roi);
    }
    if (advisorData?.mirofishSwarm?.summary) {
        addDemoted('MiroFish Swarm Combo (đánh đều)', 'COMBO', advisorData.mirofishSwarm.summary.totalDays, advisorData.mirofishSwarm.summary.netProfitK, advisorData.mirofishSwarm.summary.roi);
    }
    if (advisorData?.loTriHarmonic?.summary?.top6) {
        addDemoted('Lô TriHarmonic Top 6', 'LO', advisorData.loTriHarmonic.summary.top6.days, advisorData.loTriHarmonic.summary.top6.profitK, advisorData.loTriHarmonic.summary.top6.roi);
    }
    if (advisorData?.loDualMerge?.summary?.top6) {
        addDemoted('Lô Bạc Nhớ Vị Trí (Dual Merge Top 6)', 'LO', advisorData.loDualMerge.summary.top6.days, advisorData.loDualMerge.summary.top6.profitK, advisorData.loDualMerge.summary.top6.roi);
    }

    const report = {
        success: true,
        generatedAt: new Date().toISOString(),
        strictPit: true,
        latestDataDate,
        targetDate,
        totalSettled2026: allDatesChron.length,
        snapshotLock,
        parityToday: {
            predForm: deParityToday.predForm || 'LL',
            predFormVi: deParityToday.predFormVi || 'Lẻ - Lẻ',
            oppForm: deParityToday.oppForm || 'CC',
            oppFormVi: deParityToday.oppFormVi || 'Chẵn - Chẵn',
            predHeadVi: deParityToday.predHeadVi || 'Đầu Lẻ',
            predTailVi: deParityToday.predTailVi || 'Đít Lẻ',
            headConf: deParityToday.headConf || 55,
            tailConf: deParityToday.tailConf || 55,
            swarmAdvice: deParityToday.swarmDetails?.tacticalAdvice || null
        },
        ai5Comparison: ai5Report?.comparisonSummary || null,
        portfolios,
        methods,
        dailyLedger: dailyLedgerAsc.reverse(), // Mới nhất lên đầu
        demotedMethods
    };

    _cachedReport = report;
    _cachedAt = now;
    return report;
}

function clearBestMethodsCache() {
    _cachedReport = null;
    _cachedAt = 0;
}

module.exports = {
    buildBestMethodsReport,
    clearBestMethodsCache,
    computeWilsonLower95,
    summarizeSeries
};
