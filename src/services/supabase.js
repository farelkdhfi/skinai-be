/**
 * Supabase Client
 * Uses lazy initialization to ensure env vars are loaded
 */

import { createClient } from '@supabase/supabase-js';

let supabaseInstance = null;
let initialized = false;

/**
 * Get or create Supabase client (lazy initialization)
 */
function getSupabase() {
    if (!initialized) {
        initialized = true;
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.warn('⚠️ Supabase credentials not configured. Database features disabled.');
            supabaseInstance = null;
        } else {
            console.log('✅ Supabase client initialized');
            supabaseInstance = createClient(supabaseUrl, supabaseKey);
        }
    }
    return supabaseInstance;
}

// Export a proxy object that lazily gets supabase client
export const supabase = new Proxy({}, {
    get(target, prop) {
        const client = getSupabase();
        if (!client) return undefined;
        const value = client[prop];
        return typeof value === 'function' ? value.bind(client) : value;
    }
});

export const isSupabaseConfigured = () => getSupabase() !== null;

