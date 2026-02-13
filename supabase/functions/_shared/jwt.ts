import {
  create,
  verify,
  getNumericDate,
} from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const ALGORITHM = "HS256";
const EXPIRY_DAYS = 7;

async function getKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) throw new Error("JWT_SECRET not set");
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface JwtPayload {
  sub: string;      // user_id
  sid: string;      // session_id
  provider: string;
  role: string;
  exp: number;
}

export async function signJwt(payload: Omit<JwtPayload, "exp">): Promise<string> {
  const key = await getKey();
  return await create(
    { alg: ALGORITHM, typ: "JWT" },
    { ...payload, exp: getNumericDate(60 * 60 * 24 * EXPIRY_DAYS) },
    key,
  );
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const key = await getKey();
  const payload = await verify(token, key);
  return payload as unknown as JwtPayload;
}
