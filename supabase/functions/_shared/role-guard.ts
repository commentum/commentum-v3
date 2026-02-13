import { getSupabaseClient } from "./db.ts";
import { errorResponse } from "./cors.ts";
import type { AuthContext } from "./auth-middleware.ts";

export async function requireRole(
  auth: AuthContext,
  ...roles: string[]
): Promise<Response | null> {
  // Always confirm role from DB, never trust JWT alone
  const db = getSupabaseClient();
  const { data: user, error } = await db
    .from("users")
    .select("role")
    .eq("id", auth.userId)
    .maybeSingle();

  if (error || !user) {
    return errorResponse("User not found", 404);
  }

  if (!roles.includes(user.role)) {
    return errorResponse("Insufficient permissions", 403);
  }

  return null; // Access granted
}
