import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth-middleware.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  console.log("replies-create called with method:", req.method);
  console.log("Authorization header:", req.headers.get("Authorization")?.substring(0, 20) + "...");

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) {
    console.error("Authentication failed");
    return auth;
  }

  console.log("Authentication successful, userId:", auth.userId);

  const rl = checkRateLimit(`reply:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many replies. Try again later.", 429);
  }

  let body: { content?: string; comment_id?: string; parent_reply_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { content, comment_id, parent_reply_id } = body;
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

  // If parent_reply_id is provided, verify it exists
  if (parent_reply_id) {
    const { data: parentReply, error: parentErr } = await db
      .from("comment_replies")
      .select("id, comment_id")
      .eq("id", parent_reply_id)
      .maybeSingle();

    if (parentErr || !parentReply) {
      return errorResponse("Parent reply not found", 404);
    }

    // Verify parent reply belongs to the same comment
    if (parentReply.comment_id !== comment_id) {
      return errorResponse("Parent reply belongs to a different comment", 400);
    }
  }

  const { data: reply, error } = await db
    .from("comment_replies")
    .insert({ user_id: auth.userId, content: trimmed, comment_id, parent_reply_id: parent_reply_id || null })
    .select("id, content, score, created_at, updated_at, parent_reply_id")
    .single();

  if (error) {
    return errorResponse("Failed to create reply", 500);
  }

  return jsonResponse({ reply }, 201);
});
