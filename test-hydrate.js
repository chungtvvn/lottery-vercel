require('dotenv').config({path: '.env.local'});
const lotteryService = require('./lib/services/lotteryService');

async function test() {
    await lotteryService.loadRawData();
    const rawData = lotteryService.getRawData();
    console.log('raw 0 date:', rawData[0].date); 

    const mockStreak = { startDate: '17/03/2026', endDate: '23/03/2026' };
    
    const formatToDDMMYYYY = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    console.log('formatted raw 0 date:', formatToDDMMYYYY(rawData[0].date));
    
    const startIndex = rawData.findIndex(item => formatToDDMMYYYY(item.date) === mockStreak.startDate);
    const endIndex = rawData.findIndex(item => formatToDDMMYYYY(item.date) === mockStreak.endDate);
    
    console.log('startIndex:', startIndex, 'endIndex:', endIndex);
}
test().catch(console.error);
