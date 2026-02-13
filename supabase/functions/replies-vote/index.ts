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

  const rl = checkRateLimit(`reply_vote:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many votes. Try again later.", 429);
  }

  let body: { reply_id?: string; vote_type?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { reply_id, vote_type } = body;
  if (!reply_id || typeof reply_id !== "string") {
    return errorResponse("reply_id is required");
  }
  if (vote_type !== 1 && vote_type !== -1) {
    return errorResponse("vote_type must be 1 or -1");
  }

  const db = getSupabaseClient();

  // Verify reply exists
  const { data: reply, error: replyErr } = await db
    .from("comment_replies")
    .select("id")
    .eq("id", reply_id)
    .maybeSingle();

  if (replyErr || !reply) {
    return errorResponse("Reply not found", 404);
  }

  // Upsert vote
  const { error: voteErr } = await db
    .from("reply_votes")
    .upsert(
      { reply_id, user_id: auth.userId, vote_type },
      { onConflict: "reply_id,user_id" },
    );

  if (voteErr) {
    return errorResponse("Failed to record vote", 500);
  }

  // Recalculate score
  const { data: newScore, error: scoreErr } = await db.rpc(
    "recalculate_reply_score",
    { p_reply_id: reply_id },
  );

  if (scoreErr) {
    return errorResponse("Failed to recalculate score", 500);
  }

  return jsonResponse({ reply_id, score: newScore });
});
