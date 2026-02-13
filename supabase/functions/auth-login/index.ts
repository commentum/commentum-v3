import { handleCors, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { getSupabaseClient } from "../_shared/db.ts";
import { signJwt } from "../_shared/jwt.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";

const RATE_LIMIT = { maxRequests: 10, windowMs: 60_000 };

interface ProviderUser {
  provider_user_id: string;
  username: string;
  avatar_url?: string;
}

async function verifyMal(accessToken: string): Promise<ProviderUser | null> {
  try {
    const res = await fetch("https://api.myanimelist.net/v2/users/@me?fields=picture", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    return { provider_user_id: String(data.id), username: data.name, avatar_url: data.picture || undefined };
  } catch { return null; }
}

async function verifyAnilist(accessToken: string): Promise<ProviderUser | null> {
  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query: "query { Viewer { id name avatar { large } } }",
      }),
    });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const viewer = data?.data?.Viewer;
    if (!viewer) return null;
    return { provider_user_id: String(viewer.id), username: viewer.name, avatar_url: viewer.avatar?.large || undefined };
  } catch { return null; }
}

async function verifySimkl(accessToken: string): Promise<ProviderUser | null> {
  try {
    const res = await fetch("https://api.simkl.com/users/settings", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "simkl-api-key": accessToken,
      },
    });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const account = data?.account;
    if (!account) return null;
    return { provider_user_id: String(account.id), username: data.user?.name || `simkl_${account.id}`, avatar_url: data.account?.avatar || undefined };
  } catch { return null; }
}

const providers: Record<string, (token: string) => Promise<ProviderUser | null>> = {
  mal: verifyMal,
  anilist: verifyAnilist,
  simkl: verifySimkl,
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const ip = getClientIp(req);
  const rl = checkRateLimit(`login:${ip}`, RATE_LIMIT);
  if (!rl.allowed) {
    return errorResponse("Too many login attempts. Try again later.", 429);
  }

  let body: { provider?: string; access_token?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const { provider, access_token } = body;
  if (!provider || !access_token) {
    return errorResponse("provider and access_token are required");
  }
  if (!providers[provider]) {
    return errorResponse(`Unsupported provider: ${provider}. Use: mal, anilist, simkl`);
  }

  // Verify with provider
  const providerUser = await providers[provider](access_token);
  if (!providerUser) {
    return errorResponse("Invalid or expired provider access token", 401);
  }

  const db = getSupabaseClient();

  // Upsert user
  const { data: existingUser } = await db
    .from("users")
    .select("*")
    .eq("provider", provider)
    .eq("provider_user_id", providerUser.provider_user_id)
    .maybeSingle();

  let user;
  if (existingUser) {
    if (existingUser.is_banned) {
      return errorResponse("User is banned", 403);
    }
    // Update username and avatar if changed
    const updateData: Record<string, any> = {};
    if (existingUser.username !== providerUser.username) {
      updateData.username = providerUser.username;
    }
    if (providerUser.avatar_url && existingUser.avatar_url !== providerUser.avatar_url) {
      updateData.avatar_url = providerUser.avatar_url;
    }
    if (Object.keys(updateData).length > 0) {
      await db.from("users").update(updateData).eq("id", existingUser.id);
    }
    user = existingUser;
  } else {
    const { data: newUser, error } = await db
      .from("users")
      .insert({
        provider,
        provider_user_id: providerUser.provider_user_id,
        username: providerUser.username,
        avatar_url: providerUser.avatar_url || null,
      })
      .select()
      .single();
    if (error || !newUser) {
      return errorResponse("Failed to create user", 500);
    }
    user = newUser;
  }

  // Create session (7 days)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: session, error: sessionErr } = await db
    .from("sessions")
    .insert({ user_id: user.id, expires_at: expiresAt })
    .select()
    .single();

  if (sessionErr || !session) {
    return errorResponse("Failed to create session", 500);
  }

  // Sign JWT
  const token = await signJwt({
    sub: user.id,
    sid: session.id,
    provider,
    role: user.role,
  });

  return jsonResponse({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      provider,
    },
  });
});
