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

  const rl = checkRateLimit(`vote:${auth.userId}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many votes. Try again later.", 429);
  }

  let body: { comment_id?: string; vote_type?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { comment_id, vote_type } = body;
  if (!comment_id || typeof comment_id !== "string") {
    return errorResponse("comment_id is required");
  }
  if (vote_type !== 1 && vote_type !== -1) {
    return errorResponse("vote_type must be 1 or -1");
  }

  const db = getSupabaseClient();

  // Ensure comment exists and is active
  const { data: comment, error: commentErr } = await db
    .from("comments")
    .select("id, status")
    .eq("id", comment_id)
    .maybeSingle();

  if (commentErr || !comment) {
    return errorResponse("Comment not found", 404);
  }
  if (comment.status !== "active") {
    return errorResponse("Cannot vote on inactive comment", 400);
  }

  // Get current vote
  const { data: currentVote } = await db
    .from("comment_votes")
    .select("vote_type")
    .eq("comment_id", comment_id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  let newVoteType: number | null = vote_type;
  if (currentVote && currentVote.vote_type === vote_type) {
    // Same vote, remove it
    newVoteType = null;
  }

  if (newVoteType === null) {
    // Delete the vote
    const { error: deleteErr } = await db
      .from("comment_votes")
      .delete()
      .eq("comment_id", comment_id)
      .eq("user_id", auth.userId);
    if (deleteErr) {
      return errorResponse("Failed to remove vote", 500);
    }
  } else {
    // Upsert vote
    const { error: voteErr } = await db
      .from("comment_votes")
      .upsert(
        { comment_id, user_id: auth.userId, vote_type: newVoteType },
        { onConflict: "comment_id,user_id" },
      );
    if (voteErr) {
      return errorResponse("Failed to record vote", 500);
    }
  }

  // Recalculate score atomically
  const { data: newScore, error: scoreErr } = await db.rpc(
    "recalculate_comment_score",
    { p_comment_id: comment_id },
  );

  if (scoreErr) {
    return errorResponse("Failed to recalculate score", 500);
  }

  return jsonResponse({ comment_id, score: newScore });
});
