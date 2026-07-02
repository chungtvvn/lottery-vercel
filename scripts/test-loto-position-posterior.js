const assert = require('assert');
const {
    aggregatePositionPredictions,
    createAggregationCalibration,
    updateAggregationCalibration
} = require('./backtest-loto-milestone20y');

const positionPredictions = {
    special: [42, 43],
    prize1: [44, 45]
};
const calibration = createAggregationCalibration(2);
calibration.positions.set('special', { trials: 40, hits: 36 });
calibration.positions.set('prize1', { trials: 40, hits: 4 });

const ranked = aggregatePositionPredictions(positionPredictions, {
    mode: 'positionPosterior',
    calibrationState: calibration
});

assert.equal(
    ranked[0].number,
    42,
    'Số được giữ bởi vị trí đáng tin cậy phải đứng trước phiếu từ vị trí yếu'
);
assert.ok(ranked[0].expectedHits > ranked.find(item => item.number === 44).expectedHits);

const before = calibration.positions.get('special').hits;
updateAggregationCalibration(
    calibration,
    positionPredictions,
    { special: 42, prize1: 99 },
    new Map([[42, 1], [99, 1]])
);
assert.equal(calibration.positions.get('special').hits, before + 1);
assert.ok(calibration.supportBuckets.size > 0);

console.log('Loto position posterior aggregation tests passed.');
