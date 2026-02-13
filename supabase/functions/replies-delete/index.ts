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

  const rl = checkRateLimit(`reply-delete:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many deletions. Try again later.", 429);
  }

  let body: { reply_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { reply_id } = body;
  if (!reply_id || typeof reply_id !== "string") {
    return errorResponse("reply_id is required");
  }

  const db = getSupabaseClient();

  // Verify reply exists and belongs to user
  const { data: reply, error: replyErr } = await db
    .from("comment_replies")
    .select("id, user_id")
    .eq("id", reply_id)
    .maybeSingle();

  if (replyErr || !reply) {
    return errorResponse("Reply not found", 404);
  }

  if (reply.user_id !== auth.userId) {
    return errorResponse("You can only delete your own replies", 403);
  }

  // Delete reply
  const { error } = await db
    .from("comment_replies")
    .delete()
    .eq("id", reply_id);

  if (error) {
    return errorResponse("Failed to delete reply", 500);
  }

  return jsonResponse({ message: "Reply deleted successfully" });
});
