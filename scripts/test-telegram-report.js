const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function loadWorkerModule() {
    const source = fs.readFileSync(
        path.join(process.cwd(), 'workers', 'daily-update-dispatcher', 'src', 'index.js'),
        'utf8'
    );
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

async function main() {
    const { buildTelegramReport } = await loadWorkerModule();
    const deBetNumbers = Array.from({ length: 30 }, (_, value) => String(value).padStart(2, '0'));
    const dePayload = {
        latestDataDate: '2026-07-01',
        config: { defaultBetStrategy: 'chainBlockFirst', defaultBetTarget: 70 },
        nextPrediction: {
            predictionIsoDate: '2026-07-02',
            strategies: {
                chainBlockFirst: {
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
                    chainBlockFirst: {
                        holds: {
                            70: { betNumbers: deBetNumbers }
                        }
                    }
                },
                results: {
                    'chainBlockFirst:hold70': {
                        actual: '12',
                        betCount: 30,
                        hit: true,
                        profitK: 54000
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
                top14: {
                    numbers: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '34', '56']
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
                        profitK: -5200
                    },
                    top14: {
                        betNumbers: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '34', '56'],
                        betCount: 14,
                        hits: 4,
                        profitK: 1200
                    }
                }
            }],
            summary: {
                top6: { days: 10, hitDays: 4, profitK: 12000 },
                top14: { days: 1, hitDays: 1, profitK: 1200 }
            }
        }
    };

    const report = buildTelegramReport(dePayload, lotoPayload);
    assert.match(report.text, /Số đã đánh \(30\):/);
    assert.match(report.text, /Kết quả thực tế: <b>12<\/b>/);
    assert.match(report.text, /Lô Top 14/);
    assert.match(report.text, /Số đã đánh: <code>01 02 03 04 05 06 07 08 09 10 11 12 34 56<\/code>/);
    assert.match(report.text, /Kết quả \(27 vị trí\):/);
    assert.match(report.text, /Trúng: <b>01 12×2 34<\/b>/);
    assert.match(report.text, /Lũy kế: 10 ngày · hit-day 4\/10 · \+12\.000K/);
    assert.match(report.text, /DỰ ĐOÁN LÔ TOP 6 &amp; TOP 14/);
    assert.ok(report.text.length <= 4096, `Telegram report quá dài: ${report.text.length}`);
    console.log('Telegram report tests passed.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
