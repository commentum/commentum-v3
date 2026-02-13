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

  const roleErr = await requireRole(auth, "moderator", "admin");
  if (roleErr) return roleErr;

  let body: { comment_id?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { comment_id, status } = body;
  if (!comment_id || typeof comment_id !== "string") {
    return errorResponse("comment_id is required");
  }
  if (!status || !["active", "hidden", "removed"].includes(status)) {
    return errorResponse("status must be active, hidden, or removed");
  }

  const db = getSupabaseClient();

  const { data: comment, error } = await db
    .from("comments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", comment_id)
    .select("id, status, updated_at")
    .maybeSingle();

  if (error || !comment) {
    return errorResponse("Comment not found or update failed", 404);
  }

  return jsonResponse({ comment });
});
