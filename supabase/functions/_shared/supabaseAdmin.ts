import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js";

export function createSupabaseAdminClient(): SupabaseClient {
    const supabaseAdminClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    return supabaseAdminClient;
}