import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth-middleware.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const RATE_LIMIT = { maxRequests: 30, windowMs: 60_000 };

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

  let body: { post_id?: string; vote_type?: number };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { post_id, vote_type } = body;
  if (!post_id || typeof post_id !== "string") {
    return errorResponse("post_id is required");
  }
  if (vote_type !== 1 && vote_type !== -1) {
    return errorResponse("vote_type must be 1 or -1");
  }

  const db = getSupabaseClient();

  // Ensure post exists and is active
  const { data: post, error: postErr } = await db
    .from("posts")
    .select("id, status")
    .eq("id", post_id)
    .maybeSingle();

  if (postErr || !post) {
    return errorResponse("Post not found", 404);
  }
  if (post.status !== "active") {
    return errorResponse("Cannot vote on inactive post", 400);
  }

  // Get current vote
  const { data: currentVote } = await db
    .from("votes")
    .select("id, vote_type")
    .eq("post_id", post_id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  let newVoteType: number | null = vote_type;
  if (currentVote && currentVote.vote_type === vote_type) {
    // Same vote, remove it
    newVoteType = null;
  }

  if (newVoteType === null) {
    // Delete the vote
    if (currentVote) {
      const { error: deleteErr } = await db
        .from("votes")
        .delete()
        .eq("id", currentVote.id);
      if (deleteErr) {
        return errorResponse("Failed to remove vote", 500);
      }
    }
  } else {
    // Upsert vote (insert or update)
    if (currentVote) {
      await db
        .from("votes")
        .update({ vote_type: newVoteType })
        .eq("id", currentVote.id);
    } else {
      await db
        .from("votes")
        .insert({ post_id, user_id: auth.userId, vote_type: newVoteType });
    }
  }

  // Get updated score (trigger handles automatic update)
  const { data: updatedPost, error: scoreErr } = await db
    .from("posts")
    .select("score")
    .eq("id", post_id)
    .single();

  if (scoreErr || !updatedPost) {
    return errorResponse("Failed to fetch updated score", 500);
  }

  return jsonResponse({ post_id, score: updatedPost.score });
});
