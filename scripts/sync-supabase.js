const { spawnSync } = require('child_process');

function run(script, args = []) {
    const result = spawnSync(process.execPath, [script, ...args], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env
    });
    if (result.status !== 0) process.exit(result.status || 1);
}

run('scripts/seed-supabase-raw-data.js');
if (process.env.SYNC_LEGACY_STORAGE === '1') {
    run('scripts/seed-supabase-statistics-storage.js');
} else {
    console.log('[Supabase] Bỏ qua legacy Storage sync. Set SYNC_LEGACY_STORAGE=1 nếu cần upload JSON gzip cũ.');
}
run('scripts/sync-supabase-db-stats.js');
run('scripts/upload-to-r2.js');
