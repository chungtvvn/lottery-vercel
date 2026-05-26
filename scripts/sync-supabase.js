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
run('scripts/seed-supabase-statistics-storage.js');
run('scripts/sync-supabase-db-stats.js');
