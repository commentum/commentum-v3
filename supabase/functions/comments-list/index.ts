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
  const media_id = url.searchParams.get("media_id");

  if (!media_id) {
    return errorResponse("media_id query parameter is required", 400);
  }

  const db = getSupabaseClient();

  let query = db
    .from("posts")
    .select("id, content, score, status, created_at, updated_at, user_id, parent_id, root_id, media_id, users!inner(username, avatar_url)")
    .eq("status", "active")
    .eq("media_id", media_id)
    .is("parent_id", null)
    .order("score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: posts, error } = await query;

  if (error) {
    return errorResponse("Failed to fetch posts", 500);
  }

  // Fetch replies for each root post (max 5 per root)
  const postsWithReplies = await Promise.all(
    (posts || []).map(async (p: any) => {
      const { data: replies } = await db
        .from("posts")
        .select("id, content, score, created_at, updated_at, user_id, parent_id, root_id, users!inner(username, avatar_url)")
        .eq("root_id", p.id)
        .neq("id", p.id)
        .order("score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6);

      const hasMoreReplies = (replies?.length || 0) > 5;
      const topReplies = (replies || []).slice(0, 5);

      return {
        id: p.id,
        content: p.content,
        score: p.score,
        status: p.status,
        created_at: p.created_at,
        updated_at: p.updated_at,
        user_id: p.user_id,
        username: p.users?.username || "unknown",
        avatar_url: p.users?.avatar_url || null,
        replies: topReplies.map((r: any) => ({
          id: r.id,
          content: r.content,
          score: r.score,
          created_at: r.created_at,
          updated_at: r.updated_at,
          user_id: r.user_id,
          username: r.users?.username || "unknown",
          avatar_url: r.users?.avatar_url || null,
          parent_id: r.parent_id || null,
        })),
        has_more_replies: hasMoreReplies,
        replies_count: replies?.length || 0,
      };
    })
  );

  if (auth) {
    const postIds = postsWithReplies.map(p => p.id);
    const replyIds = postsWithReplies.flatMap(p => p.replies.map((r: any) => r.id));
    const allPostIds = [...postIds, ...replyIds];

    const { data: userVotes } = await db
      .from("votes")
      .select("post_id, vote_type")
      .in("post_id", allPostIds)
      .eq("user_id", auth.userId);

    const voteMap = new Map(userVotes?.map(v => [v.post_id, v.vote_type]) || []);

    postsWithReplies.forEach(p => {
      (p as any).user_vote = voteMap.get(p.id) || null;
      p.replies.forEach((r: any) => {
        r.user_vote = voteMap.get(r.id) || null;
      });
    });
  }

  const nextCursor =
    posts && posts.length === limit
      ? posts[posts.length - 1].created_at
      : null;

  return jsonResponse({
    comments: postsWithReplies,
    next_cursor: nextCursor,
  });
});
