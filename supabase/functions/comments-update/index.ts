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

  const rl = checkRateLimit(`comment-update:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many updates. Try again later.", 429);
  }

  let body: { comment_id?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { comment_id, content } = body;
  if (!comment_id || typeof comment_id !== "string") {
    return errorResponse("comment_id is required");
  }
  if (!content || typeof content !== "string") {
    return errorResponse("content is required");
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return errorResponse("content cannot be empty");
  }
  if (trimmed.length > 500) {
    return errorResponse("content must be 500 characters or less");
  }

  const db = getSupabaseClient();

  // Verify comment exists and belongs to user
  const { data: comment, error: commentErr } = await db
    .from("comments")
    .select("id, user_id, status")
    .eq("id", comment_id)
    .maybeSingle();

  if (commentErr || !comment) {
    return errorResponse("Comment not found", 404);
  }

  if (comment.user_id !== auth.userId) {
    return errorResponse("You can only edit your own comments", 403);
  }

  if (comment.status !== "active") {
    return errorResponse("Cannot edit inactive comment", 400);
  }

  // Update comment
  const { data: updated, error } = await db
    .from("comments")
    .update({ content: trimmed, updated_at: new Date().toISOString() })
    .eq("id", comment_id)
    .select("id, content, score, status, created_at, updated_at")
    .single();

  if (error || !updated) {
    return errorResponse("Failed to update comment", 500);
  }

  return jsonResponse({ comment: updated });
});
