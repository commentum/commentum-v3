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

  const rl = checkRateLimit(`reply:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many replies. Try again later.", 429);
  }

  let body: { content?: string; comment_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { content, comment_id } = body;
  if (!content || typeof content !== "string") {
    return errorResponse("content is required and must be a string");
  }
  if (!comment_id || typeof comment_id !== "string") {
    return errorResponse("comment_id is required and must be a string");
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return errorResponse("content cannot be empty");
  }
  if (trimmed.length > 500) {
    return errorResponse("content must be 500 characters or less");
  }

  const db = getSupabaseClient();

  // Verify comment exists
  const { data: comment, error: commentErr } = await db
    .from("comments")
    .select("id")
    .eq("id", comment_id)
    .maybeSingle();

  if (commentErr || !comment) {
    return errorResponse("Comment not found", 404);
  }

  const { data: reply, error } = await db
    .from("comment_replies")
    .insert({ user_id: auth.userId, content: trimmed, comment_id })
    .select("id, content, score, created_at, updated_at")
    .single();

  if (error) {
    return errorResponse("Failed to create reply", 500);
  }

  return jsonResponse({ reply }, 201);
});
