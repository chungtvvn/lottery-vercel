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
    assert.match(report.text, /XSMB — GỢI Ý THỰC CHIẾN HÀNG NGÀY/);
    assert.match(report.text, /1\. 💎 ĐỀ TINH HOA — DÀN 30 SỐ GỢI Ý/);
    assert.match(report.text, /2\. 🏆 LÔ CHUẨN TỐI ƯU \(DÀN 20 SỐ\)/);
    assert.match(report.text, /3\. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO \(DÀN 7 SỐ TĂNG TỐC\)/);
    assert.match(report.text, /4\. ⚡ BẢNG GỘP ĐÁNH LÔ TỔNG LỰC/);
    assert.match(report.text, /5\. 💎 LÔ XIÊN 4 TINH HOA \(QUÂY 11 VÉ\)/);
    assert.match(report.text, /6\. 📊 BẢNG THEO DÕI THỰC CHIẾN THEO GỢI Ý/);
    assert.match(report.text, /7\. 💡 KHUYẾN NGHỊ PHÂN BỔ VỐN/);
    assert.ok(!report.text.includes('LÔ XIÊN 2 CHIẾN LƯỢC'), 'Báo cáo không được chứa Lô Xiên 2');
    assert.match(report.text, /━━━━━━━━━━━━━━━━━━━━/);
    assert.ok(splitTelegramText(report.text).every(chunk => chunk.length <= 3900), 'Telegram report phải được chia gói an toàn');

    // Test with actual local disk caches
    try {
        const liveDe = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/data/statistics/cached_milestone20y_live_predictions.json'), 'utf8'));
        const nextDe = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/data/statistics/cached_milestone20y_prediction.json'), 'utf8'));
        const liveLoto = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/data/statistics/cached_loto_live_predictions.json'), 'utf8'));
        const nextLoto = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/data/statistics/cached_loto_prediction.json'), 'utf8'));
        const liveHistory = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/data/statistics/cached_prediction_history.json'), 'utf8'));

        if (!liveDe.nextPrediction && nextDe) {
            liveDe.nextPrediction = nextDe.nextPrediction || nextDe;
        }
        if (!liveLoto.nextPrediction && nextLoto) {
            liveLoto.nextPrediction = nextLoto.nextPrediction || nextLoto;
        }

        const liveAdvisor = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lib/data/statistics/cached_daily_method_advisor.json'), 'utf8'));

        const liveCompactDe = compactMilestoneTelegramPayload(liveDe);
        const liveCompactLoto = compactLotoTelegramPayload(liveLoto);
        const liveCompactHistory = {
            success: true,
            history: compactPredictionHistoryTelegramRows(liveHistory.history || [])
        };

        const liveReport = buildTelegramReport(liveCompactDe, liveCompactLoto, liveCompactHistory, liveAdvisor);
        assert.match(liveReport.text, /XSMB — GỢI Ý THỰC CHIẾN HÀNG NGÀY/);
        assert.match(liveReport.text, /BÁO CÁO KẾT QUẢ ĐỐI SOÁT HÔM NAY/);
        assert.ok(!liveReport.text.includes('LÔ XIÊN 2 CHIẾN LƯỢC'), 'Live report không được chứa Lô Xiên 2');
        console.log('=== LIVE TELEGRAM REPORT PREVIEW ===\n' + liveReport.text + '\n===================================');

        const { buildBetCalculationSheet, BETTING_TIERS } = await loadWorkerModule();

        // 1. Test fallback betting sheet (without advisor payload)
        const sheetFallback = buildBetCalculationSheet(BETTING_TIERS[3], liveReport.predictionDate);
        assert.match(sheetFallback, /BẢNG TÍNH TOÁN LỖ\/LÃI CHI TIẾT — MỨC 3: ĐỀ 200K\/SỐ · LÔ 25Đ\/SỐ/);
        assert.match(sheetFallback, /1\. 💎 ĐỀ TINH HOA \(DÀN 30 SỐ\)/);
        assert.match(sheetFallback, /200K \/ số/);
        assert.match(sheetFallback, /2\. 🏆 LÔ CHUẨN/);
        assert.match(sheetFallback, /25 điểm \/ số/);
        assert.match(sheetFallback, /3\. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO/);
        assert.match(sheetFallback, /50 điểm \/ số/);
        assert.match(sheetFallback, /4\. 💎 LÔ XIÊN 4 TINH HOA \(QUÂY 11 VÉ\)/);
        assert.match(sheetFallback, /200K \/ vé/);
        assert.match(sheetFallback, /26\.900K VNĐ/);
        assert.ok(!sheetFallback.includes('LÔ XIÊN 2 CHIẾN LƯỢC'), 'Fallback sheet không được chứa Lô Xiên 2');

        // 2. Test live betting sheet (with dynamic advisor payload)
        const sheetM3 = buildBetCalculationSheet(BETTING_TIERS[3], liveReport.predictionDate, liveAdvisor);
        assert.match(sheetM3, /BẢNG TÍNH TOÁN LỖ\/LÃI CHI TIẾT — MỨC 3: ĐỀ 200K\/SỐ · LÔ 25Đ\/SỐ/);
        assert.match(sheetM3, /1\. 💎 ĐỀ TINH HOA/);
        assert.match(sheetM3, /VIP X2/);
        assert.match(sheetM3, /Lót X1/);
        assert.match(sheetM3, /2\. 🏆 LÔ CHUẨN/);
        assert.match(sheetM3, /25 điểm \/ số/);
        assert.match(sheetM3, /3\. 🚀 LÔ ĐÁNH X2 AN TOÀN CAO/);
        assert.match(sheetM3, /50 điểm \/ số/);
        assert.match(sheetM3, /4\. 💎 LÔ XIÊN 4 TINH HOA \(QUÂY 11 VÉ\)/);
        assert.match(sheetM3, /200K \/ vé/);
        assert.match(sheetM3, /35\.900K VNĐ/);
        assert.ok(!sheetM3.includes('LÔ XIÊN 2 CHIẾN LƯỢC'), 'Bảng tính cược không được chứa Lô Xiên 2');
        console.log('=== BET CALCULATION SHEET (MỨC 3 MẶC ĐỊNH) PREVIEW ===\n' + sheetM3 + '\n====================================');
    } catch (e) {
        if (e.code === 'ENOENT') {
            console.warn('Skipping live local file test because cache file was not found:', e.message);
        } else {
            throw e;
        }
    }

    console.log('Telegram report tests passed.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
