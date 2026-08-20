#!/usr/bin/env node
'use strict';

/*
 * Converts a strict-PIT checkpoint into a compact, auditable training ledger.
 * The checkpoint was generated before each prediction date, so feature rows are
 * immutable evidence for that date and can safely be joined with its settlement.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    const input = args.get('input');
    const output = args.get('output');
    if (!input || !output) throw new Error('Dùng --input=<checkpoint.jsonl> --output=<features.jsonl>.');
    return {
        input: path.resolve(ROOT, input),
        output: path.resolve(ROOT, output)
    };
}

function hash(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function readSource(input) {
    const content = fs.readFileSync(input, 'utf8');
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed.filter(row => row && row.date);
        if (Array.isArray(parsed?.rows)) return parsed.rows.filter(row => row && row.date);
    } catch {
        // JSONL checkpoints intentionally contain multiple JSON documents.
    }
    return content
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => JSON.parse(line))
        .filter(row => row && row.date);
}

function compactEvidence(evidence) {
    const groupDetails = Object.fromEntries(Object.entries(evidence.groupDetails || {}).map(([group, detail]) => [group, {
        maxStrength: Number(detail.maxStrength || 0),
        combinedStrength: Number(detail.combinedStrength || 0),
        independentSets: Number(detail.independentSets || 0),
        activeSets: Number(detail.activeSets || 0),
        potentialSets: Number(detail.potentialSets || 0),
        tier1Sets: Number(detail.tier1Sets || 0),
        minSetSize: Number(detail.minSetSize || 100),
        meanSetSize: Number(detail.meanSetSize || 100),
        minBaseLen: Number(detail.minBaseLen || 0),
        maxBaseLen: Number(detail.maxBaseLen || 0),
        meanBaseLen: Number(detail.meanBaseLen || 0),
        recordStates: Array.isArray(detail.recordStates) ? detail.recordStates.map(String).sort() : []
    }]));
    return {
        number: Number(evidence.number),
        supportGroups: Number(evidence.supportGroups || 0),
        supportFamilies: Number(evidence.supportFamilies || 0),
        activeGroups: Number(evidence.activeGroups || 0),
        potentialGroups: Number(evidence.potentialGroups || 0),
        tier1Groups: Number(evidence.tier1Groups || 0),
        independentSets: Number(evidence.independentSets || 0),
        activeSets: Number(evidence.activeSets || 0),
        potentialSets: Number(evidence.potentialSets || 0),
        tier1Sets: Number(evidence.tier1Sets || 0),
        minSetSize: Number(evidence.minSetSize || 100),
        meanSetSize: Number(evidence.meanSetSize || 100),
        evidenceMass: Number(evidence.evidenceMass || 0),
        maxStrength: Number(evidence.maxStrength || 0),
        meanStrength: Number(evidence.meanStrength || 0),
        groups: Object.fromEntries(Object.entries(evidence.groups || {}).map(([group, strength]) => [group, Number(strength || 0)])),
        groupDetails
    };
}

function compactCandidate(candidate) {
    return {
        key: String(candidate.key || ''),
        family: String(candidate.family || ''),
        pattern: String(candidate.pattern || ''),
        state: String(candidate.state || ''),
        tier: Number(candidate.tier || 0),
        isPotential: Boolean(candidate.isPotential),
        isRecordOrSuper: Boolean(candidate.isRecordOrSuper),
        neverFormed: Boolean(candidate.neverFormed),
        recordState: String(candidate.recordState || ''),
        currentLen: Number(candidate.currentLen || 0),
        baseLen: Number(candidate.baseLen || 0),
        targetLen: Number(candidate.targetLen || 0),
        recordLen: Number(candidate.recordLen || 0),
        currentCount: Number(candidate.currentCount || 0),
        nextCount: Number(candidate.nextCount || 0),
        formationTrials: candidate.formationTrials === null ? null : Number(candidate.formationTrials || 0),
        formationCount: candidate.formationCount === null ? null : Number(candidate.formationCount || 0),
        trials: candidate.trials === null ? null : Number(candidate.trials || 0),
        successes: candidate.successes === null ? null : Number(candidate.successes || 0),
        failures: candidate.failures === null ? null : Number(candidate.failures || 0),
        failureRate: candidate.failureRate === null ? null : Number(candidate.failureRate || 0),
        risk: Number(candidate.risk || candidate.dropoffRate || candidate.failureRate || 0),
        setSize: Array.isArray(candidate.numbers) ? candidate.numbers.length : Number(candidate.setSize || 0),
        numbers: (candidate.numbers || []).map(Number).sort((a, b) => a - b)
    };
}

function convertRow(row) {
    const evidence = Array.isArray(row.numberEvidence) ? row.numberEvidence.map(compactEvidence) : [];
    const evidenceByNumber = new Map(evidence.map(item => [item.number, item]));
    const missing = ALL_NUMBERS.filter(number => !evidenceByNumber.has(number));
    if (missing.length) throw new Error(`${row.date}: thiếu numberEvidence cho ${missing.join(', ')}.`);
    const candidateDiagnostics = Array.isArray(row.candidateDiagnostics)
        ? row.candidateDiagnostics.map(compactCandidate)
        : [];
    const payload = {
        schemaVersion: 'strict-pit-chain-features-v1',
        date: String(row.date || ''),
        actual: Number(row.actual),
        featureSource: 'strict-prefix-point-in-time',
        generationSeconds: Number(row.generationSeconds || 0),
        candidateCount: Number(row.candidateCount || candidateDiagnostics.length),
        strategies: Object.fromEntries(Object.entries(row.strategies || {}).map(([strategy, numbers]) => [
            strategy,
            (numbers || []).map(Number).filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
                .sort((left, right) => left - right)
        ])),
        numberEvidence: ALL_NUMBERS.map(number => evidenceByNumber.get(number)),
        candidateDiagnostics
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date) || !Number.isInteger(payload.actual) || payload.actual < 0 || payload.actual > 99) {
        throw new Error('Checkpoint có hàng không đủ date/actual hợp lệ.');
    }
    payload.featureHash = hash(JSON.stringify({
        date: payload.date,
        actual: payload.actual,
        numberEvidence: payload.numberEvidence,
        candidateDiagnostics: payload.candidateDiagnostics
    }));
    return payload;
}

function main() {
    const { input, output } = parseArgs();
    const checkpointRows = readSource(input);
    if (checkpointRows.length === 0) {
        throw new Error('Nguồn strict-PIT chưa có ngày đã xử lý; chỉ có metadata hoặc tệp rỗng.');
    }
    const rows = checkpointRows.map(convertRow).sort((left, right) => left.date.localeCompare(right.date));
    const uniqueDates = new Set(rows.map(row => row.date));
    if (uniqueDates.size !== rows.length) throw new Error('Checkpoint chứa ngày trùng; hãy resume/đối soát trước khi trích xuất.');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
    const meta = {
        schemaVersion: 'strict-pit-chain-features-v1',
        input: path.relative(ROOT, input),
        output: path.relative(ROOT, output),
        rows: rows.length,
        dateRange: rows.length ? [rows[0].date, rows.at(-1).date] : [],
        generatedAt: new Date().toISOString(),
        inputHash: hash(fs.readFileSync(input)),
        outputHash: hash(fs.readFileSync(output))
    };
    fs.writeFileSync(`${output}.meta.json`, `${JSON.stringify(meta, null, 2)}\n`);
    console.log(JSON.stringify(meta, null, 2));
}

main();
