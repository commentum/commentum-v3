import { verifyJwt, type JwtPayload } from "./jwt.ts";
import { getSupabaseClient } from "./db.ts";
import { errorResponse } from "./cors.ts";

export interface AuthContext {
  userId: string;
  sessionId: string;
  provider: string;
  role: string;
}

export async function authenticate(req: Request): Promise<AuthContext | Response> {
  let token: string | null = null;
  const authHeader = req.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }

  if (!token) {
    const cookie = req.headers.get("Cookie");
    token = cookie?.match(/(^|;)\s*auth_token\s*=\s*([^;]+)/)?.[2] || null;
  }

  if (!token) return errorResponse("Missing Authentication", 401);

  let payload: JwtPayload;
  try {
    payload = await verifyJwt(token);
  } catch {
    return errorResponse("Invalid or expired token", 401);
  }

  const db = getSupabaseClient();
  const { data: session } = await db
    .from("sessions")
    .select("id, user_id, revoked, expires_at")
    .eq("id", payload.sid)
    .maybeSingle();

  if (!session || session.revoked || new Date(session.expires_at) < new Date()) {
    return errorResponse("Session invalid or expired", 401);
  }

  const { data: user } = await db
    .from("users")
    .select("id, is_banned, role")
    .eq("id", payload.sub)
    .maybeSingle();

  if (!user || user.is_banned) {
    return errorResponse(user?.is_banned ? "User is banned" : "User not found", 403);
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    provider: payload.provider,
    role: user.role,
  };
}