import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js";

export function createSupabaseClient(token?: string): SupabaseClient {
    const opts = token
        ? { global: { headers: { Authorization: `${token}` } } }
        : undefined;

    const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        opts
    );

    return supabaseClient;
}