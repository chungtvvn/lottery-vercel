/**
 * Fix missing columns in streak_statistics table
 * Run from project root: node scripts/fix-schema.js
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manual .env.local parsing
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false }
});

async function fixSchema() {
  console.log('Checking current streak_statistics columns...');
  
  const { data, error } = await supabase
    .from('streak_statistics')
    .select('*')
    .limit(1);
  
  if (error) {
    console.log('Error reading streak_statistics:', error.message);
    if (error.code === '42P01') {
      console.log('Table does not exist at all. Please run the full migration 003.');
      return;
    }
  } else {
    const cols = data && data.length > 0 ? Object.keys(data[0]) : [];
    console.log('Current columns:', cols.join(', ') || '(empty table - inserting test row...)');
    
    if (cols.length === 0) {
      // Insert a dummy row to discover columns
      const { error: testErr } = await supabase
        .from('streak_statistics')
        .upsert({
          pattern_key: '__test__',
          category_type: 'test',
          category: 'test',
          extension_gap_stats: {},
          length_history_metrics: {}
        });
      
      if (testErr) {
        console.log('Test insert error:', testErr.message);
        if (testErr.message.includes('extension_gap_stats')) {
          console.log('❌ Column extension_gap_stats is MISSING');
        }
        if (testErr.message.includes('length_history_metrics')) {
          console.log('❌ Column length_history_metrics is MISSING');
        }
      } else {
        console.log('✅ All columns exist (test insert succeeded)!');
        // Clean up
        await supabase.from('streak_statistics').delete().eq('pattern_key', '__test__');
        return;
      }
    } else {
      const hasExtGap = cols.includes('extension_gap_stats');
      const hasLenHist = cols.includes('length_history_metrics');
      
      console.log(`extension_gap_stats: ${hasExtGap ? '✅ EXISTS' : '❌ MISSING'}`);
      console.log(`length_history_metrics: ${hasLenHist ? '✅ EXISTS' : '❌ MISSING'}`);
      
      if (hasExtGap && hasLenHist) {
        console.log('\n✅ All columns exist! No fix needed.');
        return;
      }
    }
  }
  
  // Extract project ref from URL
  const projectRef = supabaseUrl.replace('https://', '').replace('.supabase.co', '');
  
  console.log('\n' + '='.repeat(80));
  console.log('⚠️  MISSING COLUMNS DETECTED');
  console.log('='.repeat(80));
  console.log('\nPlease run this SQL in Supabase Dashboard SQL Editor:');
  console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new\n`);
  console.log('-'.repeat(80));
  console.log(`
ALTER TABLE public.streak_statistics 
  ADD COLUMN IF NOT EXISTS extension_gap_stats jsonb,
  ADD COLUMN IF NOT EXISTS length_history_metrics jsonb;
`);
  console.log('-'.repeat(80));
  console.log('\nAfter running the SQL above, come back here and run:');
  console.log('   FORCE_REGENERATE_STATS=1 LOTTERY_STATS_SOURCE=db npx @dotenvx/dotenvx run -- node scripts/update-static-data.js');
}

fixSchema().catch(console.error);
