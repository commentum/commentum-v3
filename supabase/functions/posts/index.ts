import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticate, optionalAuthenticate } from "../_shared/auth-middleware.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const RATE_LIMIT_POST = { maxRequests: 5, windowMs: 60_000 };
const RATE_LIMIT_UPDATE = { maxRequests: 10, windowMs: 60_000 };
const RATE_LIMIT_DELETE = { maxRequests: 10, windowMs: 60_000 };

Deno.serve(async (req) => {
    const cors = handleCors(req);
    if (cors) return cors;

    if (req.method === "OPTIONS") {
        return jsonResponse({ message: "OK" }, 200);
    }

    const { method } = req;
    const db = getSupabaseClient();

    let auth;

    // Authenticate based on method
    if (method === "GET") {
        const authResult = await optionalAuthenticate(req);
        if (authResult instanceof Response) return authResult;
        auth = authResult; // can be null or { userId }
    } else {
        const authResult = await authenticate(req);
        if (authResult instanceof Response) return authResult;
        auth = authResult; // { userId }
    }

    try {
        // --- CREATE (POST) ---
        if (method === "POST") {
            if (!auth) return errorResponse("Unauthorized", 401);
            const rl = checkRateLimit(`post-create:${auth.userId}`, RATE_LIMIT_POST);
            if (!rl.allowed) return errorResponse("Too many posts. Try again later.", 429);

            let body: { content?: string; media_id?: string; media_provider?: string, parent_id?: string; client?: string; episode_number?: number | null };
            try {
                body = await req.json();
            } catch {
                return errorResponse("Invalid JSON body");
            }

            const { content, media_id, media_provider, parent_id, client } = body;
            let episode_number = body.episode_number !== undefined ? body.episode_number : null;
            if (episode_number !== null && (typeof episode_number !== "number" || isNaN(episode_number) || episode_number < 0)) {
                return errorResponse("episode_number must be a valid non-negative integer");
            }
            if (episode_number !== null) episode_number = Math.floor(episode_number);

            // Validation
            if (!content || typeof content !== "string") {
                return errorResponse("content is required and must be a string");
            }
            const trimmed = content.trim();
            if (trimmed.length === 0) return errorResponse("content cannot be empty");
            if (trimmed.length > 500) return errorResponse("content must be 500 characters or less");

            if (!media_id && !parent_id) {
                return errorResponse("Either media_id (for comments) or parent_id (for replies) is required");
            }

            let finalMediaId = media_id || null;
            let finalMediaProvider = media_provider || null;
            let finalEpisodeNumber = episode_number;
            let finalRootId: string | null = null;

            // If reply, verify parent exists and inherit metadata
            if (parent_id) {
                const { data: parentPost, error: parentErr } = await db
                    .from("posts")
                    .select("id, root_id, media_id, media_provider, episode_number")
                    .eq("id", parent_id)
                    .maybeSingle();

                if (parentErr || !parentPost) return errorResponse("Parent post not found", 404);

                finalRootId = parentPost.root_id || parentPost.id;
                finalMediaId = finalMediaId || parentPost.media_id || null;
                finalMediaProvider = finalMediaProvider || parentPost.media_provider || null;
                if (finalEpisodeNumber === null && parentPost.episode_number !== undefined) {
                    finalEpisodeNumber = parentPost.episode_number ?? null;
                }
            }

            const insertPayload: any = {
                user_id: auth.userId,
                content: trimmed,
                media_id: finalMediaId,
                media_provider: finalMediaProvider,
                episode_number: finalEpisodeNumber,
                parent_id: parent_id || null,
                client: client || null,
                status: "active"
            };
            if (finalRootId) {
                insertPayload.root_id = finalRootId;
            }

            // Insert
            const { data: post, error } = await db
                .from("posts")
                .insert(insertPayload)
                .select("id, client, content, score, status, created_at, updated_at, parent_id, root_id, media_id, media_provider, episode_number, user:users!inner(username, avatar_url)")
                .single();

            if (error) {
                console.error("Insert error:", error);
                return errorResponse("Failed to create post", 500);
            }

            return jsonResponse({ post }, 201);
        }

        // --- UPDATE (PATCH) ---
        if (method === "PATCH") {
            if (!auth) return errorResponse("Unauthorized", 401);
            const rl = checkRateLimit(`post-update:${auth.userId}`, RATE_LIMIT_UPDATE);
            if (!rl.allowed) return errorResponse("Too many updates. Try again later.", 429);

            let body: { id?: string; content?: string };
            try {
                body = await req.json();
            } catch {
                return errorResponse("Invalid JSON body");
            }

            const { id, content } = body;
            if (!id || typeof id !== "string") return errorResponse("id is required");
            if (!content || typeof content !== "string") return errorResponse("content is required");

            const trimmed = content.trim();
            if (trimmed.length === 0) return errorResponse("content cannot be empty");
            if (trimmed.length > 500) return errorResponse("content must be 500 characters or less");

            // Verify ownership
            const { data: post, error: postErr } = await db
                .from("posts")
                .select("id, user_id, status")
                .eq("id", id)
                .maybeSingle();

            if (postErr || !post) return errorResponse("Post not found", 404);
            if (post.user_id !== auth.userId) return errorResponse("You can only edit your own posts", 403);
            if (post.status !== "active") return errorResponse("Cannot edit inactive post", 400);

            // Update
            const { data: updated, error } = await db
                .from("posts")
                .update({ content: trimmed, updated_at: new Date().toISOString() })
                .eq("id", id)
                .select("id, client, content, score, status, created_at, updated_at, parent_id, root_id, media_id, media_provider, episode_number, user:users!inner(username, avatar_url)")
                .single();

            if (error || !updated) return errorResponse("Failed to update post", 500);

            return jsonResponse({ post: updated });
        }

        // --- DELETE (DELETE) ---
        if (method === "DELETE") {
            if (!auth) return errorResponse("Unauthorized", 401);
            const rl = checkRateLimit(`post-delete:${auth.userId}`, RATE_LIMIT_DELETE);
            if (!rl.allowed) return errorResponse("Too many deletions. Try again later.", 429);

            const url = new URL(req.url);
            let id = url.searchParams.get("id");

            if (!id) {
                try {
                    const body = await req.json();
                    id = body.id;
                } catch {
                    // ignore
                }
            }

            if (!id || typeof id !== "string") return errorResponse("id is required (query param or body)");

            // Verify ownership
            const { data: post, error: postErr } = await db
                .from("posts")
                .select("id, user_id")
                .eq("id", id)
                .maybeSingle();

            if (postErr || !post) return errorResponse("Post not found", 404);
            if (post.user_id !== auth.userId) return errorResponse("You can only delete your own posts", 403);

            // Soft delete
            const { data: deleted, error } = await db
                .from("posts")
                .update({ status: "deleted", updated_at: new Date().toISOString() })
                .eq("id", id)
                .select("id, status, updated_at")
                .single();

            if (error || !deleted) return errorResponse("Failed to delete post", 500);

            return jsonResponse({ post: deleted });
        }

        // --- LIST (GET) ---
        if (method === "GET") {
            const url = new URL(req.url);
            const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20"), 1), 100);
            const cursor = url.searchParams.get("cursor");

            const media_id = url.searchParams.get("media_id");
            const root_id = url.searchParams.get("root_id");
            const parent_id = url.searchParams.get("parent_id");
            const episode_param = url.searchParams.get("episode_number");

            if (!media_id && !root_id && !parent_id) {
                return errorResponse("media_id (for comments) or root_id/parent_id (for replies) is required", 400);
            }

            let query = db
                .from("posts")
                .select("id, client, content, score, status, created_at, updated_at, user_id, parent_id, root_id, media_id, media_provider, episode_number, user:users!inner(username, avatar_url)")
                .eq("status", "active")
                .order("score", { ascending: false })
                .order("created_at", { ascending: false })
                .limit(limit);

            // 1. List Comments (Root Posts)
            if (media_id) {
                query = query
                    .eq("media_id", media_id)
                    .is("parent_id", null);

                if (episode_param !== null && episode_param !== undefined) {
                    if (episode_param === "0" || episode_param.toLowerCase() === "none" || episode_param.toLowerCase() === "null") {
                        query = query.is("episode_number", null);
                    } else {
                        const epNum = parseInt(episode_param);
                        if (!isNaN(epNum)) {
                            query = query.eq("episode_number", epNum);
                        }
                    }
                }
            }
            // 2. List Replies
            else if (root_id || parent_id) {
                if (parent_id) {
                    query = query.eq("parent_id", parent_id);
                } else if (root_id) {
                    // All replies to a root post
                    query = query
                        .eq("root_id", root_id)
                        .neq("id", root_id);
                }
            }

            if (cursor) {
                query = query.lt("created_at", cursor);
            }

            const { data: posts, error } = await query;
            if (error) return errorResponse("Failed to fetch posts", 500);

            let result = [];
            let totalCommentCount = 0;
            let totalReplyCount = 0;

            // If listing root comments, fetch previews of replies
            if (media_id) {
                // Get total comment count for this media
                let commentCountQuery = db
                    .from("posts")
                    .select("id", { count: "exact", head: true })
                    .eq("media_id", media_id)
                    .is("parent_id", null)
                    .eq("status", "active");

                if (episode_param !== null && episode_param !== undefined) {
                    if (episode_param === "0" || episode_param.toLowerCase() === "none" || episode_param.toLowerCase() === "null") {
                        commentCountQuery = commentCountQuery.is("episode_number", null);
                    } else {
                        const epNum = parseInt(episode_param);
                        if (!isNaN(epNum)) {
                            commentCountQuery = commentCountQuery.eq("episode_number", epNum);
                        }
                    }
                }

                const { count: commentCount } = await commentCountQuery;
                totalCommentCount = commentCount || 0;

                result = await Promise.all(
                    (posts || []).map(async (p: any) => {
                        // Preview replies (top 5 + 1 to check has_more) along with exact reply count in a single query
                        const { data: replies, count: replyCount } = await db
                            .from("posts")
                            .select("id, client, content, score, status, created_at, updated_at, user_id, parent_id, root_id, media_id, media_provider, episode_number, user:users!inner(username, avatar_url)", { count: "exact" })
                            .eq("root_id", p.id)
                            .neq("id", p.id)
                            .eq("status", "active")
                            .order("score", { ascending: false })
                            .order("created_at", { ascending: false })
                            .limit(6);

                        const hasMoreReplies = (replies?.length || 0) > 5;
                        const topReplies = (replies || []).slice(0, 5);

                        return {
                            ...p,
                            replies: topReplies.map((r: any) => ({
                                ...r,
                            })),
                            has_more_replies: hasMoreReplies,
                            replies_count: replyCount || 0,
                        };
                    })
                );
            } else {
                // Get total reply count
                let replyCountQuery = db
                    .from("posts")
                    .select("id", { count: "exact", head: true })
                    .eq("status", "active");

                if (parent_id) {
                    replyCountQuery = replyCountQuery.eq("parent_id", parent_id);
                } else if (root_id) {
                    replyCountQuery = replyCountQuery
                        .eq("root_id", root_id)
                        .neq("id", root_id);
                }

                const { count: replyCount } = await replyCountQuery;
                totalReplyCount = replyCount || 0;

                // Just formatting for replies list
                result = (posts || []).map((p: any) => ({
                    ...p,
                }));
            }

            // Fetch User Votes if authenticated
            if (auth) {
                // Collect all IDs to fetch votes for
                let allIds: string[] = [];
                if (media_id) {
                    allIds = result.flatMap((p: any) => [p.id, ...(p.replies || []).map((r: any) => r.id)]);
                } else {
                    allIds = result.map((p: any) => p.id);
                }

                if (allIds.length > 0) {
                    const { data: userVotes } = await db
                        .from("votes")
                        .select("post_id, vote_type")
                        .in("post_id", allIds)
                        .eq("user_id", auth.userId);

                    const voteMap = new Map(userVotes?.map(v => [v.post_id, v.vote_type]) || []);

                    result.forEach((p: any) => {
                        p.user_vote = voteMap.get(p.id) || null;
                        if (p.replies) {
                            p.replies.forEach((r: any) => {
                                r.user_vote = voteMap.get(r.id) || null;
                            });
                        }
                    });
                }
            }

            const nextCursor =
                result.length === limit ? result[result.length - 1].created_at : null;

            // Wrap in appropriate key
            if (media_id) {
                return jsonResponse({
                    comments: result,
                    comment_count: totalCommentCount,
                    next_cursor: nextCursor,
                });
            } else {
                return jsonResponse({
                    replies: result,
                    reply_count: totalReplyCount,
                    next_cursor: nextCursor,
                });
            }
        }

        return errorResponse("Method not allowed", 405);

    } catch (err: any) {
        console.error("Unexpected error:", err);
        return errorResponse(err.message || "Internal Server Error", 500);
    }
});
