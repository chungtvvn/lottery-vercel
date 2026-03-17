require('dotenv').config({ path: '.env.local' });
const { uploadFullStatsToStorage } = require('./lib/data-access');
const axios = require('axios');
const API_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json';
const fs = require('fs');
const path = require('path');
const generateSumDifferenceStats = require('./lib/generators/sumDifferenceStatsGenerator');

async function run() {
    console.log('Fetching raw data...');
    const response = await axios.get(API_URL);
    const tmpDataDir = '/tmp/lottery_data';
    const tmpStatsDir = '/tmp/lottery_stats';
    fs.mkdirSync(tmpDataDir, { recursive: true });
    fs.mkdirSync(tmpStatsDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDataDir, 'xsmb-2-digits.json'), JSON.stringify(response.data));
    
    console.log('Generating sum diff...');
    await generateSumDifferenceStats(tmpDataDir, tmpStatsDir);
    
    console.log('Uploading to storage...');
    const stats = JSON.parse(fs.readFileSync(path.join(tmpStatsDir, 'sum_difference_stats.json'), 'utf8'));
    await uploadFullStatsToStorage('sum_diff', stats);
    console.log('Done!');
}
run();
