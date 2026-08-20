const assert = require('assert');
const {
    createHierarchicalFamilies,
    validatePartitionFamilies,
    buildFeatureRows,
    trainConditionalSoftmax,
    selectTopNumbers
} = require('../lib/research/hierarchicalSetDistribution');

const families = createHierarchicalFamilies();
const diagnostics = validatePartitionFamilies(families);
assert.equal(diagnostics.length, 15);
assert.ok(diagnostics.every(item => item.minSize > 0));

const draws = Array.from({ length: 900 }, (_, index) => ({
    date: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10),
    special: (index * 17 + 3) % 100
}));
const mutated = draws.map(row => ({ ...row }));
mutated[800].special = 99;

const first = buildFeatureRows(draws, { minimumHistory: 730, priorStrength: 80 });
const second = buildFeatureRows(mutated, { minimumHistory: 730, priorStrength: 80 });
const targetIndex = first.rows.findIndex(row => row.date === draws[800].date);
assert.ok(targetIndex >= 0);
assert.deepEqual(
    first.rows[targetIndex].featuresByNumber.map(values => Array.from(values)),
    second.rows[targetIndex].featuresByNumber.map(values => Array.from(values)),
    'Đặc trưng ngày D không được dùng kết quả của chính ngày D.'
);
assert.notDeepEqual(
    first.rows[targetIndex + 1].featuresByNumber.map(values => Array.from(values)),
    second.rows[targetIndex + 1].featuresByNumber.map(values => Array.from(values)),
    'Kết quả ngày D phải chỉ ảnh hưởng từ D+1.'
);

const trainRows = first.rows.slice(0, 100);
const weights = trainConditionalSoftmax(trainRows, {
    epochs: 2,
    learningRate: 0.1,
    l2: 0.05
});
const selected = selectTopNumbers(first.rows[120], weights, 30);
assert.equal(selected.length, 30);
assert.equal(new Set(selected).size, 30);

console.log('hierarchicalSetDistribution: OK');
