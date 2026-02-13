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

  let body: { post_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { post_id } = body;
  if (!post_id || typeof post_id !== "string") {
    return errorResponse("post_id is required");
  }

  const db = getSupabaseClient();

  // Verify post exists and belongs to user
  const { data: post, error: postErr } = await db
    .from("posts")
    .select("id, user_id")
    .eq("id", post_id)
    .maybeSingle();

  if (postErr || !post) {
    return errorResponse("Post not found", 404);
  }

  if (post.user_id !== auth.userId) {
    return errorResponse("You can only delete your own posts", 403);
  }

  // Mark post as deleted
  const { data: deleted, error } = await db
    .from("posts")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", post_id)
    .select("id, status, updated_at")
    .single();

  if (error || !deleted) {
    return errorResponse("Failed to delete post", 500);
  }

  return jsonResponse({ post: deleted });
});
