const fs = require('fs');
const path = require('path');
const { fetchAllRecentXsmbResults } = require('./sources/xoso-com-vn');

const JSON_FILE = path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');

(async () => {
    try {
        const raw = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
        console.log(`Số bản ghi hiện tại trong xsmb-2-digits.json: ${raw.length}`);
        console.log(`Ngày cuối cùng hiện có: ${raw[raw.length - 1].date}`);

        const recentRows = await fetchAllRecentXsmbResults();
        console.log(`Lấy được ${recentRows.length} kỳ quay gần đây từ xoso.com.vn`);

        const existingDateSet = new Set(raw.map(r => r.date));
        let addedCount = 0;

        for (const row of recentRows) {
            if (!existingDateSet.has(row.date) && row.date && row.special !== undefined && row.prize1 !== undefined) {
                // Đảm bảo cấu trúc chuẩn
                const cleanRow = {
                    date: row.date,
                    special: Number(row.special),
                    prize1: Number(row.prize1),
                    prize2_1: Number(row.prize2_1),
                    prize2_2: Number(row.prize2_2),
                    prize3_1: Number(row.prize3_1),
                    prize3_2: Number(row.prize3_2),
                    prize3_3: Number(row.prize3_3),
                    prize3_4: Number(row.prize3_4),
                    prize3_5: Number(row.prize3_5),
                    prize3_6: Number(row.prize3_6),
                    prize4_1: Number(row.prize4_1),
                    prize4_2: Number(row.prize4_2),
                    prize4_3: Number(row.prize4_3),
                    prize4_4: Number(row.prize4_4),
                    prize5_1: Number(row.prize5_1),
                    prize5_2: Number(row.prize5_2),
                    prize5_3: Number(row.prize5_3),
                    prize5_4: Number(row.prize5_4),
                    prize5_5: Number(row.prize5_5),
                    prize5_6: Number(row.prize5_6),
                    prize6_1: Number(row.prize6_1),
                    prize6_2: Number(row.prize6_2),
                    prize6_3: Number(row.prize6_3),
                    prize7_1: Number(row.prize7_1),
                    prize7_2: Number(row.prize7_2),
                    prize7_3: Number(row.prize7_3),
                    prize7_4: Number(row.prize7_4)
                };
                raw.push(cleanRow);
                existingDateSet.add(row.date);
                addedCount++;
                console.log(`✓ Đã thêm ngày ${row.date} (ĐB = ${cleanRow.special})`);
            }
        }

        if (addedCount > 0) {
            raw.sort((a, b) => a.date.localeCompare(b.date));
            fs.writeFileSync(JSON_FILE, JSON.stringify(raw, null, 2), 'utf8');
            console.log(`🎉 Đã cập nhật thành công ${addedCount} ngày mới vào xsmb-2-digits.json. Tổng cộng: ${raw.length} ngày.`);
            console.log(`Ngày mới nhất hiện tại: ${raw[raw.length - 1].date}`);
        } else {
            console.log('Dữ liệu đã cập nhật đầy đủ, không có ngày mới cần thêm.');
        }
    } catch (err) {
        console.error('Lỗi cập nhật dữ liệu:', err);
        process.exit(1);
    }
})();
