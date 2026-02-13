import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

let _client: ReturnType<typeof createClient> | null = null;

export function getSupabaseClient() {
  if (!_client) {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    _client = createClient(url, key);
  }
  return _client;
}
