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
  } catch (error) {
    console.error("JWT verification failed:", error);
    return errorResponse("Invalid JWT token", 401);
  }

  const db = getSupabaseClient();
  const { data: session } = await db
    .from("sessions")
    .select("id, user_id, revoked, expires_at")
    .eq("id", payload.sid)
    .maybeSingle();

  if (!session) {
    return errorResponse("Session not found", 401);
  }
  if (session.revoked) {
    return errorResponse("Session revoked", 401);
  }
  if (new Date(session.expires_at) < new Date()) {
    return errorResponse("Session expired", 401);
  }

  const { data: user } = await db
    .from("users")
    .select("id, is_banned, role")
    .eq("id", payload.sub)
    .maybeSingle();

  if (!user) {
    return errorResponse("User not found", 401);
  }
  if (user.is_banned) {
    return errorResponse("User is banned", 403);
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    provider: payload.provider,
    role: user.role,
  };
}

export async function optionalAuthenticate(req: Request): Promise<AuthContext | null> {
  let token: string | null = null;
  const authHeader = req.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.replace("Bearer ", "");
  }

  if (!token) {
    const cookie = req.headers.get("Cookie");
    token = cookie?.match(/(^|;)\s*auth_token\s*=\s*([^;]+)/)?.[2] || null;
  }

  if (!token) return null;

  let payload: JwtPayload;
  try {
    payload = await verifyJwt(token);
  } catch {
    return null;
  }

  const db = getSupabaseClient();
  const { data: session } = await db
    .from("sessions")
    .select("id, user_id, revoked, expires_at")
    .eq("id", payload.sid)
    .maybeSingle();

  if (!session || session.revoked || new Date(session.expires_at) < new Date()) {
    return null;
  }

  const { data: user } = await db
    .from("users")
    .select("id, is_banned, role")
    .eq("id", payload.sub)
    .maybeSingle();

  if (!user || user.is_banned) {
    return null;
  }

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    provider: payload.provider,
    role: user.role,
  };
}