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
  if (auth instanceof Response) {
    return auth;
  }

  const rl = checkRateLimit(`post:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many posts. Try again later.", 429);
  }

  let body: { content?: string; media_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { content, media_id } = body;
  if (!content || typeof content !== "string") {
    return errorResponse("content is required and must be a string");
  }
  if (!media_id || typeof media_id !== "string") {
    return errorResponse("media_id is required and must be a string");
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return errorResponse("content cannot be empty");
  }
  if (trimmed.length > 500) {
    return errorResponse("content must be 500 characters or less");
  }

  const db = getSupabaseClient();

  // Insert root post (parent_id and root_id will be NULL, auto-assigned by triggers)
  const { data: post, error } = await db
    .from("posts")
    .insert({ 
      user_id: auth.userId, 
      parent_id: null,
      root_id: null,
      media_id, 
      content: trimmed,
      status: "active"
    })
    .select("id, content, score, status, created_at, updated_at, parent_id, root_id, media_id, users!inner(username, avatar_url)")
    .single();

  if (error) {
    console.error("Insert error:", error);
    return errorResponse("Failed to create post", 500);
  }

  return jsonResponse({ post }, 201);
});
