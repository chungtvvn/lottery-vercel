require('dotenv').config({ path: '.env.local' });
const { getAdminClient } = require('./lib/supabase');
const fs = require('fs');

async function checkSupabaseConnection() {
    const admin = getAdminClient();
    const { data, error } = await admin.from('cache_store').select('id').limit(1);
    if(error) {
        console.error("SUPABASE CONNECTION FAILED:", error);
    } else {
        console.log("SUPABASE CONNECTION OK");
    }
}
checkSupabaseConnection();
