import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth-middleware.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const RATE_LIMIT = { maxRequests: 5, windowMs: 60_000 };

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const rl = checkRateLimit(`report:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many reports. Try again later.", 429);
  }

  let body: { comment_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { comment_id, reason } = body;
  if (!comment_id || typeof comment_id !== "string") {
    return errorResponse("comment_id is required");
  }
  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return errorResponse("reason is required");
  }

  const db = getSupabaseClient();

  // Ensure comment exists
  const { data: comment, error: commentErr } = await db
    .from("comments")
    .select("id, status")
    .eq("id", comment_id)
    .maybeSingle();

  if (commentErr || !comment) {
    return errorResponse("Comment not found", 404);
  }

  // Insert report
  const { error: reportErr } = await db
    .from("comment_reports")
    .insert({ comment_id, user_id: auth.userId, reason: reason.trim() });

  if (reportErr) {
    return errorResponse("Failed to submit report", 500);
  }

  // Auto-hide at 5+ unresolved reports
  const { data: count } = await db.rpc("count_unresolved_reports", {
    p_comment_id: comment_id,
  });

  if (count !== null && count >= 5 && comment.status === "active") {
    await db
      .from("comments")
      .update({ status: "hidden", updated_at: new Date().toISOString() })
      .eq("id", comment_id);
  }

  return jsonResponse({ message: "Report submitted" }, 201);
});
