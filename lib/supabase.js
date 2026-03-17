/**
 * Supabase Client - Singleton pattern
 * 2 clients: public (anon, cho API reads) và admin (service_role, cho writes)
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Public client (anon key) - safe to use in API routes, can only READ
let _publicClient = null;
function getPublicClient() {
    if (!_publicClient) {
        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
        }
        _publicClient = createClient(supabaseUrl, supabaseAnonKey);
    }
    return _publicClient;
}

// Admin client (service_role key) - ONLY use in server-side scripts, can READ + WRITE
let _adminClient = null;
function getAdminClient() {
    if (!_adminClient) {
        const url = supabaseUrl || process.env.SUPABASE_URL;
        const key = supabaseServiceKey || process.env.SUPABASE_SERVICE_KEY;
        if (!url || !key) {
            throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        }
        _adminClient = createClient(url, key);
    }
    return _adminClient;
}

module.exports = { getPublicClient, getAdminClient };
