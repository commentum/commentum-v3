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
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20"), 1), 100);
  const cursor = url.searchParams.get("cursor");
  const mediaId = url.searchParams.get("mediaId");

  if (!mediaId) {
    return errorResponse("mediaId query parameter is required", 400);
  }

  const db = getSupabaseClient();

  let query = db
    .from("comments")
    .select("id, content, score, status, created_at, updated_at, user_id, users!inner(username, avatar_url)")
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

  // Fetch replies for each comment (max 5 per comment) - only top-level replies
  const commentsWithReplies = await Promise.all(
    (comments || []).map(async (c: any) => {
      const { data: replies, error: repliesError } = await db
        .from("comment_replies")
        .select("id, content, score, created_at, updated_at, user_id, parent_reply_id, users!inner(username, avatar_url)")
        .eq("comment_id", c.id)
        .is("parent_reply_id", null)
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
        avatar_url: c.users?.avatar_url || null,
        replies: topReplies.map((r: any) => ({
          id: r.id,
          content: r.content,
          score: r.score,
          created_at: r.created_at,
          updated_at: r.updated_at,
          user_id: r.user_id,
          username: r.users?.username || "unknown",
          avatar_url: r.users?.avatar_url || null,
          parent_reply_id: r.parent_reply_id || null,
        })),
        has_more_replies: hasMoreReplies,
        replies_count: replies?.length || 0,
      };
    })
  );

  if (auth) {
    const commentIds = commentsWithReplies.map(c => c.id);
    const replyIds = commentsWithReplies.flatMap(c => c.replies.map((r: any) => r.id));

    const [commentVotes, replyVotes] = await Promise.all([
      db.from("comment_votes").select("comment_id, vote_type").in("comment_id", commentIds).eq("user_id", auth.userId),
      db.from("reply_votes").select("reply_id, vote_type").in("reply_id", replyIds).eq("user_id", auth.userId)
    ]);

    const commentVoteMap = new Map(commentVotes.data?.map(v => [v.comment_id, v.vote_type]) || []);
    const replyVoteMap = new Map(replyVotes.data?.map(v => [v.reply_id, v.vote_type]) || []);

    commentsWithReplies.forEach(c => {
      (c as any).user_vote = commentVoteMap.get(c.id) || null;
      c.replies.forEach((r: any) => {
        (r as any).user_vote = replyVoteMap.get(r.id) || null;
      });
    });
  }

  const nextCursor =
    commentsWithReplies.length === limit
      ? commentsWithReplies[commentsWithReplies.length - 1].created_at
      : null;

  return jsonResponse({
    comments: commentsWithReplies,
    next_cursor: nextCursor,
  });
});
