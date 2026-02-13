import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth-middleware.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const db = getSupabaseClient();
  const { data: user, error } = await db
    .from("users")
    .select("id, username, role, provider, avatar_url, created_at")
    .eq("id", auth.userId)
    .maybeSingle();

  if (error || !user) {
    return errorResponse("User not found", 404);
  }

  return jsonResponse({ user });
});
