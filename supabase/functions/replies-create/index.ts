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
  if (auth instanceof Response) {
    return auth;
  }

  const rl = checkRateLimit(`reply:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many replies. Try again later.", 429);
  }

  let body: { content?: string; parent_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { content, parent_id } = body;
  if (!content || typeof content !== "string") {
    return errorResponse("content is required and must be a string");
  }
  if (!parent_id || typeof parent_id !== "string") {
    return errorResponse("parent_id is required and must be a string");
  }

  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return errorResponse("content cannot be empty");
  }
  if (trimmed.length > 500) {
    return errorResponse("content must be 500 characters or less");
  }

  const db = getSupabaseClient();

  // Verify parent post exists
  const { data: parentPost, error: parentErr } = await db
    .from("posts")
    .select("id, root_id")
    .eq("id", parent_id)
    .maybeSingle();

  if (parentErr || !parentPost) {
    return errorResponse("Parent post not found", 404);
  }

  // Insert reply (parent_id is set, root_id will be auto-assigned by trigger)
  const { data: reply, error } = await db
    .from("posts")
    .insert({ 
      user_id: auth.userId,
      parent_id,
      root_id: null,
      media_id: null,
      content: trimmed,
      status: "active"
    })
    .select("id, content, score, status, created_at, updated_at, parent_id, root_id, users!inner(username, avatar_url)")
    .single();

  if (error) {
    return errorResponse("Failed to create reply", 500);
  }

  return jsonResponse({ reply }, 201);
});
