const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
    compactMilestoneTelegramPayload,
    compactLotoTelegramPayload,
    compactPredictionHistoryTelegramRows
} = require('../lib/utils/telegramPayloadProjection');

async function loadWorkerModule() {
    const source = fs.readFileSync(
        path.join(process.cwd(), 'workers', 'daily-update-dispatcher', 'src', 'index.js'),
        'utf8'
    );
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

async function main() {
    const { buildTelegramReport, evaluatePredictionCacheReadiness, splitTelegramText } = await loadWorkerModule();
    assert.deepStrictEqual(
        evaluatePredictionCacheReadiness(
            { latestDataDate: '2026-07-15' },
            { latestDataDate: '2026-07-15' }
        ),
        {
            ready: true,
            dataDate: '2026-07-15',
            expectedDataDate: null,
            deLatestDataDate: '2026-07-15',
            lotoLatestDataDate: '2026-07-15'
        }
    );
    assert.strictEqual(
        evaluatePredictionCacheReadiness(
            { latestDataDate: '2026-07-15' },
            { latestDataDate: '2026-07-14' }
        ).ready,
        false
    );
    assert.strictEqual(
        evaluatePredictionCacheReadiness(
            { latestDataDate: '2026-07-15' },
            { latestDataDate: '2026-07-15' },
            '2026-07-16'
        ).ready,
        false
    );
    const deBetNumbers = Array.from({ length: 30 }, (_, value) => String(value).padStart(2, '0'));
    // Keep Edge75 distinct from the parallel strategy so this test proves that
    // Telegram reads the immutable History snapshot for the exact 30 numbers.
    const edgeHistoryBetNumbers = Array.from({ length: 30 }, (_, value) => String(value + 70).padStart(2, '0'));
    const dePayload = {
        latestDataDate: '2026-07-01',
        config: { defaultBetStrategy: 'deParallelBlock85Small65', defaultBetTarget: 70 },
        nextPrediction: {
            predictionIsoDate: '2026-07-02',
            strategies: {
                deParallelBlock85Small65: {
                    holds: {
                        70: { betNumbers: deBetNumbers }
                    }
                },
                deMilestoneHistoryEdge75UnionX2: {
                    holds: {
                        70: { betNumbers: deBetNumbers, intersectionNumbers: ['12'] }
                    }
                },
                chainSmallFirst: {
                    holds: {
                        70: { betNumbers: Array.from({ length: 30 }, (_, value) => String(value).padStart(2, '0')) }
                    }
                },
                dedupEdge75Pit: {
                    holds: {
                        70: { betNumbers: deBetNumbers }
                    }
                }
            }
        },
        livePredictions: {
            predictions: [{
                status: 'settled',
                predictionIsoDate: '2026-07-01',
                actualSpecial: '12',
                strategies: {
                    deParallelBlock85Small65: {
                        holds: {
                            70: { betNumbers: deBetNumbers }
                        }
                    },
                    chainSmallFirst: {
                        holds: {
                            70: { betNumbers: Array.from({ length: 30 }, (_, value) => String(value).padStart(2, '0')) }
                        }
                    }
                },
                results: {
                    'deParallelBlock85Small65:hold70': {
                        actual: '12',
                        betCount: 30,
                        hit: true,
                        profitK: 540
                    },
                    'deMilestoneHistoryEdge75UnionX2:hold70': {
                        actual: '12',
                        betCount: 30,
                        unitCount: 31,
                        hit: true,
                        profitK: 624
                    },
                    'chainSmallFirst:hold70': {
                        actual: '12',
                        betCount: 30,
                        hit: true,
                        profitK: 540
                    },
                    'dedupEdge75Pit:hold70': {
                        actual: '12',
                        betCount: 30,
                        hit: true,
                        profitK: 540
                    }
                },
                strategies: {
                    deMilestoneHistoryEdge75UnionX2: {
                        holds: { 70: { betNumbers: deBetNumbers, intersectionNumbers: ['12'] } }
                    },
                    dedupEdge75Pit: {
                        holds: { 70: { betNumbers: deBetNumbers } }
                    }
                }
            }]
        }
    };
    const lotoPayload = {
        latestDataDate: '2026-07-01',
        nextPrediction: {
            predictionIsoDate: '2026-07-02',
            methodId: 'testLotoMethod',
            predictions: {
                top6: {
                    numbers: ['01', '02', '03', '04', '05', '06']
                },
                top7: {
                    numbers: ['01', '02', '03', '04', '05', '06', '07'],
                    overlapNumbers: ['02']
                }
            },
            strategies: {
                rrfParallelBlock85Small65: {
                    predictions: {
                        top6: { numbers: ['01', '02', '03', '04', '05', '06'] },
                        top7: { numbers: ['01', '02', '03', '04', '05', '06', '07'], overlapNumbers: ['02'] }
                    }
                },
                dedupEdge75Pit: {
                    predictions: {
                        top6: { numbers: ['11', '12', '13', '14', '15', '16'] },
                        top7: { numbers: ['11', '12', '13', '14', '15', '16', '17'] }
                    }
                },
                milestoneEdge75PitFusion: {
                    predictions: {
                        top6: { numbers: ['01', '11', '12', '13', '14', '15'] },
                        top7: { numbers: ['01', '11', '12', '13', '14', '15', '16'] }
                    }
                }
            }
        },
        livePredictions: {
            predictions: [{
                status: 'settled',
                predictionIsoDate: '2026-07-01',
                actual: { '01': 1, 12: 2, 34: 1, 55: 23 },
                methods: {
                    top6: {
                        betNumbers: ['01', '02', '03', '04', '05', '06'],
                        betCount: 6,
                        hits: 1,
                        profitK: -520
                    },
                    top7: {
                        betNumbers: ['01', '02', '03', '04', '05', '06', '07'],
                        overlapNumbers: ['02'],
                        betCount: 7,
                        unitCount: 7,
                        hits: 1,
                        profitK: -740
                    }
                },
                strategies: {
                    rrfParallelBlock85Small65: {
                        methods: {
                            top6: {
                                betNumbers: ['01', '02', '03', '04', '05', '06'],
                                betCount: 6,
                                hits: 1,
                                profitK: -520
                            },
                            top7: {
                                betNumbers: ['01', '02', '03', '04', '05', '06', '07'],
                                overlapNumbers: ['02'],
                                betCount: 7,
                                hits: 1,
                                profitK: -740
                            }
                        }
                    },
                    dedupEdge75Pit: {
                        methods: {
                            top6: {
                                betNumbers: ['11', '12', '13', '14', '15', '16'],
                                betCount: 6,
                                hits: 2,
                                profitK: 2800
                            },
                            top7: {
                                betNumbers: ['11', '12', '13', '14', '15', '16', '17'],
                                betCount: 7,
                                hits: 2,
                                profitK: 2580
                            }
                        }
                    },
                    milestoneEdge75PitFusion: {
                        methods: {
                            top6: {
                                betNumbers: ['01', '11', '12', '13', '14', '15'],
                                betCount: 6,
                                hits: 2,
                                profitK: 2800
                            },
                            top7: {
                                betNumbers: ['01', '11', '12', '13', '14', '15', '16'],
                                betCount: 7,
                                hits: 2,
                                profitK: 2580
                            }
                        }
                    }
                }
            }],
            summary: {
                top6: { days: 10, hitDays: 4, profitK: 12000 },
                top7: { days: 1, hitDays: 1, profitK: 1200 },
                dedupEdge75Pit_top6: { days: 1, hitDays: 1, profitK: 2800 },
                dedupEdge75Pit_top7: { days: 1, hitDays: 1, profitK: 2580 }
            }
        }
    };
    for (const count of [20, 25, 30]) {
        const rrfNumbers = Array.from({ length: count }, (_, index) => String(index + 1).padStart(2, '0'));
        const edgeNumbers = Array.from({ length: count }, (_, index) => String(index + 40).padStart(2, '0'));
        const key = `top${count}`;
        lotoPayload.nextPrediction.strategies.rrfParallelBlock85Small65.predictions[key] = { numbers: rrfNumbers };
        lotoPayload.nextPrediction.strategies.dedupEdge75Pit.predictions[key] = { numbers: edgeNumbers };
        lotoPayload.nextPrediction.strategies.milestoneEdge75PitFusion.predictions[key] = { numbers: edgeNumbers };
        lotoPayload.livePredictions.predictions[0].strategies.rrfParallelBlock85Small65.methods[key] = {
            betNumbers: rrfNumbers, betCount: count, hits: 1
        };
        lotoPayload.livePredictions.predictions[0].strategies.dedupEdge75Pit.methods[key] = {
            betNumbers: edgeNumbers, betCount: count, hits: 1
        };
        lotoPayload.livePredictions.predictions[0].strategies.milestoneEdge75PitFusion.methods[key] = {
            betNumbers: edgeNumbers, betCount: count, hits: 1
        };
        lotoPayload.livePredictions.summary[`rrfParallelBlock85Small65_${key}`] = {
            days: 1, hitDays: 1, profitK: 800 - count * 220
        };
        lotoPayload.livePredictions.summary[`dedupEdge75Pit_${key}`] = {
            days: 1, hitDays: 1, profitK: 800 - count * 220
        };
        lotoPayload.livePredictions.summary[`milestoneEdge75PitFusion_${key}`] = {
            days: 1, hitDays: 1, profitK: 800 - count * 220
        };
    }
    const historyPayload = {
        history: [
            {
                predictionDate: '2026-07-02',
                sourceDrawDate: '2026-07-01',
                summary: {
                    resolved: false,
                    methods: {
                        deParallelBlock85Small65Hold70: {
                            numbersToBet: deBetNumbers,
                            intersectionNumbers: ['12']
                        },
                        dedupEdge75Hold70: {
                            numbersToBet: edgeHistoryBetNumbers,
                            intersectionNumbers: []
                        }
                    }
                }
            },
            {
                predictionDate: '2026-07-01',
                sourceDrawDate: '2026-06-30',
                summary: {
                    resolved: true,
                    actualSpecial: 12,
                    methods: {
                        deParallelBlock85Small65Hold70: {
                            numbersToBet: deBetNumbers,
                            intersectionNumbers: ['12'],
                            betCount: 30,
                            unitCount: 31,
                            betWin: true,
                            actualSpecial: 12
                        },
                        dedupEdge75Hold70: {
                            numbersToBet: edgeHistoryBetNumbers,
                            intersectionNumbers: [],
                            betCount: 30,
                            unitCount: 30,
                            betWin: false,
                            actualSpecial: 12
                        }
                    }
                }
            }
        ]
    };

    // Production Worker must consume the compact API view. Add representative
    // bulky fields here to guard against accidentally forwarding them again.
    dePayload.baseline = { rows: Array.from({ length: 100 }, () => ({ evidence: 'unused' })) };
    lotoPayload.positionPredictions = Array.from({ length: 27 }, () => ({ evidence: 'unused' }));
    lotoPayload.livePredictions.predictions[0].positionPredictions = Array.from(
        { length: 27 },
        () => ({ evidence: 'unused' })
    );
    historyPayload.history[0].chainRows = Array.from({ length: 100 }, () => ({ evidence: 'unused' }));

    const compactDe = compactMilestoneTelegramPayload(dePayload);
    const compactLoto = compactLotoTelegramPayload(lotoPayload);
    const compactHistory = {
        history: compactPredictionHistoryTelegramRows(historyPayload.history)
    };
    assert.ok(
        JSON.stringify(compactDe).length < JSON.stringify(dePayload).length,
        'Payload Đề Telegram phải nhỏ hơn cache đầy đủ'
    );
    assert.ok(
        JSON.stringify(compactLoto).length < JSON.stringify(lotoPayload).length,
        'Payload Lô Telegram phải nhỏ hơn cache đầy đủ'
    );
    assert.ok(
        JSON.stringify(compactHistory).length < JSON.stringify(historyPayload).length,
        'Payload Lịch sử Telegram phải nhỏ hơn cache đầy đủ'
    );
    assert.strictEqual(compactLoto.positionPredictions, undefined);
    assert.strictEqual(compactLoto.livePredictions.predictions[0].positionPredictions, undefined);
    assert.strictEqual(compactHistory.history[0].chainRows, undefined);

    const report = buildTelegramReport(compactDe, compactLoto, compactHistory);
    assert.match(report.text, /Đã đánh \(30 số\):/);
    assert.match(report.text, /KQ thực tế: <b>12<\/b>/);
    assert.match(report.text, /ĐỀ — GỘP EDGE75 LỊCH SỬ \+ SONG SONG MỐC 20 NĂM \(X2 SỐ TRÙNG\)/);
    assert.match(report.text, /Số giao đánh x2: <b>12<\/b>/);
    assert.match(report.text, /ĐỀ — SONG SONG MỐC 20 NĂM HOLD 70/);
    assert.match(report.text, /ĐỀ — SONG SONG LỊCH SỬ HOLD 70/);
    assert.match(report.text, /EDGE KHỬ TRÙNG 75% NỀN - HOLD 70/);
    assert.match(report.text, /Đã đánh \(30 số\): <code>70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95 96 97 98 99<\/code>/);
    assert.doesNotMatch(report.text, /Chuỗi nhỏ trước Hold 70/);
    assert.match(report.text, /LÔ — RRF SONG SONG/);
    assert.match(report.text, /LÔ — EDGE75 PIT CÓ KIỂM CHỨNG - HOLD 70/);
    assert.match(report.text, /LÔ — GỘP MỐC 20 NĂM RRF \+ EDGE75 PIT \(RRF 50\/50\)/);
    assert.match(report.text, /Top 30 dự đoán/);
    assert.match(report.text, /Top 7 đã chốt: <code>01 02 03 04 05 06 07<\/code>/);
    assert.match(report.text, /KQ 01\/07\/2026 \(27 vị trí\):/);
    assert.match(report.text, /🟩 TRÚNG: <b>01<\/b>/);
    assert.match(report.text, /❌ LỖ · -740K · 1 hit/);
    assert.match(report.text, /Thống kê: 10 ngày · hit-day 4\/10 · \+12\.000K/);
    assert.match(report.text, /━━━━━━━━━━━━━━━━━━━━/);
    assert.ok(splitTelegramText(report.text).every(chunk => chunk.length <= 3900), 'Telegram report phải được chia gói an toàn');
    console.log('Telegram report tests passed.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
