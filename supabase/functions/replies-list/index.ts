import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { optionalAuthenticate } from "../_shared/auth-middleware.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const auth = await optionalAuthenticate(req);

  const url = new URL(req.url);
  const commentId = url.searchParams.get("comment_id");
  const parentReplyId = url.searchParams.get("parent_reply_id");
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20"), 1), 100);
  const cursor = url.searchParams.get("cursor");

  if (!commentId) {
    return errorResponse("comment_id query parameter is required", 400);
  }

  const db = getSupabaseClient();

  // Verify comment exists
  const { data: comment, error: commentErr } = await db
    .from("comments")
    .select("id")
    .eq("id", commentId)
    .maybeSingle();

  if (commentErr || !comment) {
    return errorResponse("Comment not found", 404);
  }

  let query = db
    .from("comment_replies")
    .select("id, content, score, created_at, updated_at, user_id, parent_reply_id, users!inner(username, avatar_url)")
    .eq("comment_id", commentId)
    .order("score", { ascending: false })
    .order("created_at", { ascending: false });

  // Filter by parent_reply_id if provided (for nested replies)
  if (parentReplyId) {
    query = query.eq("parent_reply_id", parentReplyId);
  } else {
    // Only show top-level replies if no parent specified
    query = query.is("parent_reply_id", null);
  }

  query = query.limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: replies, error } = await query;

  if (error) {
    return errorResponse("Failed to fetch replies", 500);
  }

  const result = (replies || []).map((r: any) => ({
    id: r.id,
    content: r.content,
    score: r.score,
    created_at: r.created_at,
    updated_at: r.updated_at,
    user_id: r.user_id,
    username: r.users?.username || "unknown",
    avatar_url: r.users?.avatar_url || null,
    parent_reply_id: r.parent_reply_id || null,
  }));

  if (auth) {
    const replyIds = result.map(r => r.id);
    const { data: votes } = await db
      .from("reply_votes")
      .select("reply_id, vote_type")
      .in("reply_id", replyIds)
      .eq("user_id", auth.userId);
    const voteMap = new Map(votes?.map(v => [v.reply_id, v.vote_type]) || []);
    result.forEach(r => {
      (r as any).user_vote = voteMap.get(r.id) || null;
    });
  }

  const nextCursor =
    result.length === limit ? result[result.length - 1].created_at : null;

  return jsonResponse({ replies: result, next_cursor: nextCursor });
});
