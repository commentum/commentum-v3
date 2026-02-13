import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth-middleware.ts";
import { requireRole } from "../_shared/role-guard.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const roleErr = await requireRole(auth, "moderator", "admin");
  if (roleErr) return roleErr;

  const db = getSupabaseClient();

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20"), 1), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);

  const { data: reports, error } = await db
    .from("comment_reports")
    .select(`
      id, reason, created_at, resolved,
      comment_id,
      comments!inner(id, content, status, user_id, users!inner(username)),
      users!comment_reports_user_id_fkey(username)
    `)
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return errorResponse("Failed to fetch reports", 500);
  }

  const result = (reports || []).map((r: any) => ({
    id: r.id,
    reason: r.reason,
    created_at: r.created_at,
    comment_id: r.comment_id,
    comment_content: r.comments?.content,
    comment_status: r.comments?.status,
    comment_author: r.comments?.users?.username,
    reporter: r.users?.username,
  }));

  return jsonResponse({ reports: result });
});
