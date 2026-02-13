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

  const rl = checkRateLimit(`reply-update:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many updates. Try again later.", 429);
  }

  let body: { reply_id?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { reply_id, content } = body;
  if (!reply_id || typeof reply_id !== "string") {
    return errorResponse("reply_id is required");
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

  // Verify post exists and belongs to user
  const { data: post, error: postErr } = await db
    .from("posts")
    .select("id, user_id")
    .eq("id", reply_id)
    .maybeSingle();

  if (postErr || !post) {
    return errorResponse("Post not found", 404);
  }

  if (post.user_id !== auth.userId) {
    return errorResponse("You can only edit your own posts", 403);
  }

  // Update post
  const { data: updated, error } = await db
    .from("posts")
    .update({ content: trimmed, updated_at: new Date().toISOString() })
    .eq("id", reply_id)
    .select("id, content, score, created_at, updated_at")
    .single();

  if (error || !updated) {
    return errorResponse("Failed to update post", 500);
  }

  return jsonResponse({ reply: updated });
});
