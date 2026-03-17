
require('dotenv').config({ path: '.env.local' });
const { getPublicClient, getAdminClient } = require('./lib/supabase');
async function test() {
  // Let's create a huge 4MB object
  const obj = {};
  for(let i=0; i<100000; i++) obj['abc'+i] = [1,2,3,4,5,6,7,8,9];
  const s1 = Date.now();
  const { error } = await getAdminClient().from('cache_store').upsert({ key: 'test_huge', data: obj });
  console.log('Upsert:', Date.now()-s1, error);
  const s2 = Date.now();
  const { data, error2 } = await getPublicClient().from('cache_store').select('data').eq('key', 'test_huge').single();
  console.log('Select:', Date.now()-s2, error2);
}
test();
