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
  const root_id = url.searchParams.get("root_id");
  const parent_id = url.searchParams.get("parent_id");
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20"), 1), 100);
  const cursor = url.searchParams.get("cursor");

  if (!root_id && !parent_id) {
    return errorResponse("root_id or parent_id query parameter is required", 400);
  }

  const db = getSupabaseClient();

  let query = db
    .from("posts")
    .select("id, content, score, created_at, updated_at, user_id, parent_id, root_id, users!inner(username, avatar_url)")
    .eq("status", "active")
    .order("score", { ascending: false })
    .order("created_at", { ascending: false });

  // Filter replies to a specific post
  if (parent_id) {
    query = query.eq("parent_id", parent_id);
  } else {
    // Fetch direct children of root post (first-level replies)
    query = query.eq("root_id", root_id)
      .is("parent_id", null)
      .neq("id", root_id);
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
    parent_id: r.parent_id || null,
  }));

  if (auth) {
    const replyIds = result.map(r => r.id);
    const { data: userVotes } = await db
      .from("votes")
      .select("post_id, vote_type")
      .in("post_id", replyIds)
      .eq("user_id", auth.userId);
    const voteMap = new Map(userVotes?.map(v => [v.post_id, v.vote_type]) || []);
    result.forEach(r => {
      (r as any).user_vote = voteMap.get(r.id) || null;
    });
  }

  const nextCursor =
    result.length === limit ? result[result.length - 1].created_at : null;

  return jsonResponse({ replies: result, next_cursor: nextCursor });
});
