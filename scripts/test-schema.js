/**
 * Test upsert with extension_gap_stats column
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (!process.env[key]) process.env[key] = value;
  }
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function test() {
  console.log('Testing upsert with extension_gap_stats...');
  
  const { data, error } = await supabase
    .from('streak_statistics')
    .upsert({
      pattern_key: '__test_ext__',
      category_type: 'test',
      category: 'test',
      extension_gap_stats: { test: true },
      length_history_metrics: { test: true }
    })
    .select();
  
  if (error) {
    console.log('❌ Upsert FAILED:', error.message);
    console.log('   PostgREST schema cache needs reload!');
    
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').replace('.supabase.co', '');
    console.log(`\n   Go to: https://supabase.com/dashboard/project/${projectRef}/settings/api`);
    console.log('   Click "Reload schema cache" under "Schema" section');
  } else {
    console.log('✅ Upsert SUCCESS:', JSON.stringify(data));
    
    // Cleanup
    await supabase.from('streak_statistics').delete().eq('pattern_key', '__test_ext__');
    console.log('   Cleaned up test row.');
    console.log('\n🎉 Schema is ready! You can now run the data sync.');
  }
}

test().catch(console.error);
