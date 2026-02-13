import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth-middleware.ts";
import { requireRole } from "../_shared/role-guard.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const roleErr = await requireRole(auth, "admin");
  if (roleErr) return roleErr;

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { user_id } = body;
  if (!user_id || typeof user_id !== "string") {
    return errorResponse("user_id is required");
  }

  // Prevent self-ban
  if (user_id === auth.userId) {
    return errorResponse("Cannot ban yourself", 400);
  }

  const db = getSupabaseClient();

  // Ban user
  const { data: user, error: banErr } = await db
    .from("users")
    .update({ is_banned: true })
    .eq("id", user_id)
    .select("id, username, is_banned")
    .maybeSingle();

  if (banErr || !user) {
    return errorResponse("User not found", 404);
  }

  // Revoke all sessions
  await db
    .from("sessions")
    .update({ revoked: true })
    .eq("user_id", user_id);

  return jsonResponse({ message: `User ${user.username} has been banned`, user });
});
