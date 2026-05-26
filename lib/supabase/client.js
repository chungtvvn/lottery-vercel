const { createClient } = require('@supabase/supabase-js');

let readonlyClient = null;
let adminClient = null;

function getSupabaseUrl() {
    return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

function getReadonlyKey() {
    return (
        process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        ''
    );
}

function getServiceKey() {
    return (
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        ''
    );
}

function createServerClient(key) {
    const url = getSupabaseUrl();
    if (!url || !key) {
        throw new Error('Missing Supabase URL or key. Check NEXT_PUBLIC_SUPABASE_URL and Supabase keys in .env.local.');
    }

    return createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        },
        global: {
            headers: {
                'X-Client-Info': 'lottery-stats-vercel/server'
            }
        }
    });
}

function hasSupabaseReadonlyConfig() {
    return Boolean(getSupabaseUrl() && getReadonlyKey());
}

function hasSupabaseAdminConfig() {
    return Boolean(getSupabaseUrl() && getServiceKey());
}

function getSupabaseReadonlyClient() {
    if (!readonlyClient) readonlyClient = createServerClient(getReadonlyKey());
    return readonlyClient;
}

function getSupabaseAdminClient() {
    if (!adminClient) adminClient = createServerClient(getServiceKey());
    return adminClient;
}

module.exports = {
    hasSupabaseReadonlyConfig,
    hasSupabaseAdminConfig,
    getSupabaseReadonlyClient,
    getSupabaseAdminClient
};
