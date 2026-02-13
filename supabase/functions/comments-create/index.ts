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

  const rl = checkRateLimit(`comment:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many comments. Try again later.", 429);
  }

  let body: { content?: string; mediaId?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { content, mediaId } = body;
  if (!content || typeof content !== "string") {
    return errorResponse("content is required and must be a string");
  }
  if (!mediaId || typeof mediaId !== "string") {
    return errorResponse("mediaId is required and must be a string");
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return errorResponse("content cannot be empty");
  }
  if (trimmed.length > 500) {
    return errorResponse("content must be 500 characters or less");
  }

  const db = getSupabaseClient();
  const { data: comment, error } = await db
    .from("comments")
    .insert({ user_id: auth.userId, content: trimmed, media_id: mediaId })
    .select("id, content, score, status, created_at, updated_at")
    .single();

  if (error) {
    return errorResponse("Failed to create comment", 500);
  }

  return jsonResponse({ comment }, 201);
});
