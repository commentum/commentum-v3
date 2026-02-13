import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth-middleware.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const RATE_LIMIT = { maxRequests: 5, windowMs: 60_000 };

Deno.serve(async (req) => {
    const cors = handleCors(req);
    if (cors) return cors;

    if (req.method === "OPTIONS") {
        return jsonResponse({ message: "OK" }, 200);
    }

    if (req.method !== "POST") {
        return errorResponse("Method not allowed", 405);
    }

    const auth = await authenticate(req);
    if (auth instanceof Response) return auth;

    const rl = checkRateLimit(`report:${auth.userId}`, RATE_LIMIT);
    if (!rl.allowed) {
        return errorResponse("Too many reports. Try again later.", 429);
    }

    let body: { post_id?: string; reason?: string };
    try {
        body = await req.json();
    } catch {
        return errorResponse("Invalid JSON body");
    }

    const { post_id, reason } = body;
    if (!post_id || typeof post_id !== "string") {
        return errorResponse("post_id is required");
    }
    if (!reason || typeof reason !== "string") {
        return errorResponse("reason is required");
    }

    const db = getSupabaseClient();

    // Verify post exists
    const { data: post, error: postErr } = await db
        .from("posts")
        .select("id, status")
        .eq("id", post_id)
        .maybeSingle();

    if (postErr || !post) {
        return errorResponse("Post not found", 404);
    }

    // Check if already reported by this user
    const { data: existing } = await db
        .from("reports")
        .select("id")
        .eq("post_id", post_id)
        .eq("reporter_id", auth.userId)
        .maybeSingle();

    if (existing) {
        return errorResponse("You have already reported this post", 400);
    }

    // Insert report
    const { error } = await db
        .from("reports")
        .insert({
            post_id,
            reporter_id: auth.userId,
            reason,
            status: "pending"
        });

    if (error) {
        return errorResponse(`Failed to submit report: ${error.message}`, 500);
    }

    // Check report count for auto-hide (e.g. 5 reports)
    const { count } = await db
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("post_id", post_id);

    if (count && count >= 5 && post.status === "active") {
        await db
            .from("posts")
            .update({ status: "hidden" })
            .eq("id", post_id);
    }

    return jsonResponse({ message: "Report submitted" }, 201);
});
