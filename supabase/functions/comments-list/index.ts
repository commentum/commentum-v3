import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20"), 1), 100);
  const cursor = url.searchParams.get("cursor");
  const mediaId = url.searchParams.get("mediaId");

  if (!mediaId) {
    return errorResponse("mediaId query parameter is required", 400);
  }

  const db = getSupabaseClient();

  let query = db
    .from("comments")
    .select("id, content, score, status, created_at, updated_at, user_id, users!inner(username)")
    .eq("status", "active")
    .eq("media_id", mediaId)
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: comments, error } = await query;

  if (error) {
    return errorResponse("Failed to fetch comments", 500);
  }

  // Fetch replies for each comment (max 5 per comment)
  const commentsWithReplies = await Promise.all(
    (comments || []).map(async (c: any) => {
      const { data: replies, error: repliesError } = await db
        .from("comment_replies")
        .select("id, content, score, created_at, updated_at, user_id, users!inner(username)")
        .eq("comment_id", c.id)
        .order("score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6); // Fetch 6 to determine if there are more

      const hasMoreReplies = (replies?.length || 0) > 5;
      const topReplies = (replies || []).slice(0, 5);

      return {
        id: c.id,
        content: c.content,
        score: c.score,
        status: c.status,
        created_at: c.created_at,
        updated_at: c.updated_at,
        user_id: c.user_id,
        username: c.users?.username || "unknown",
        replies: topReplies.map((r: any) => ({
          id: r.id,
          content: r.content,
          score: r.score,
          created_at: r.created_at,
          updated_at: r.updated_at,
          user_id: r.user_id,
          username: r.users?.username || "unknown",
        })),
        has_more_replies: hasMoreReplies,
        replies_count: replies?.length || 0,
      };
    })
  );

  const nextCursor =
    commentsWithReplies.length === limit
      ? commentsWithReplies[commentsWithReplies.length - 1].created_at
      : null;

  return jsonResponse({
    comments: commentsWithReplies,
    next_cursor: nextCursor,
  });
});
