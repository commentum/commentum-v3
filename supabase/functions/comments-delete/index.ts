import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth-middleware.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const rl = checkRateLimit(`comment-delete:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many deletions. Try again later.", 429);
  }

  let body: { comment_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { comment_id } = body;
  if (!comment_id || typeof comment_id !== "string") {
    return errorResponse("comment_id is required");
  }

  const db = getSupabaseClient();

  // Verify comment exists and belongs to user
  const { data: comment, error: commentErr } = await db
    .from("comments")
    .select("id, user_id")
    .eq("id", comment_id)
    .maybeSingle();

  if (commentErr || !comment) {
    return errorResponse("Comment not found", 404);
  }

  if (comment.user_id !== auth.userId) {
    return errorResponse("You can only delete your own comments", 403);
  }

  // Mark comment as deleted
  const { data: deleted, error } = await db
    .from("comments")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", comment_id)
    .select("id, status, updated_at")
    .single();

  if (error || !deleted) {
    return errorResponse("Failed to delete comment", 500);
  }

  return jsonResponse({ comment: deleted });
});
