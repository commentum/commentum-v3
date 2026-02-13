import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth-middleware.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const db = getSupabaseClient();
  const { error } = await db
    .from("sessions")
    .update({ revoked: true })
    .eq("id", auth.sessionId);

  if (error) {
    return errorResponse("Failed to revoke session", 500);
  }

  return jsonResponse({ message: "Logged out successfully" });
});
