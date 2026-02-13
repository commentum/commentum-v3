import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(req.url);
  const commentId = url.searchParams.get("comment_id");
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
    .select("id, content, score, created_at, updated_at, user_id, users!inner(username)")
    .eq("comment_id", commentId)
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

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
  }));

  const nextCursor =
    result.length === limit ? result[result.length - 1].created_at : null;

  return jsonResponse({ replies: result, next_cursor: nextCursor });
});
