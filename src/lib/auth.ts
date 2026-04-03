import { chmod } from "node:fs/promises";
import type { AuthCache, AuthResult } from "./types.js";
import { AUTH_CACHE_PATH } from "./paths.js";

const CLIENT_ID = "00000000402b5328";
const TIMEOUT = 15_000; // ms

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function postForm(url: string, data: Record<string, string>): Promise<Json> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  // Don't throw on non-2xx — polling returns 400 with authorization_pending
  return res.json();
}

async function postJson(url: string, data: unknown): Promise<Json> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  return res.json();
}

async function getJson(url: string, headers: Record<string, string>): Promise<Json> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT),
  });
  return res.json();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deviceCodeFlow(): Promise<[msToken: string, refreshToken: string]> {
  const d = await postForm("https://login.live.com/oauth20_connect.srf", {
    client_id: CLIENT_ID,
    scope: "service::user.auth.xboxlive.com::MBI_SSL",
    response_type: "device_code",
  });

  console.error(`\n  Open: ${d.verification_uri}`);
  console.error(`  Code: ${d.user_code}\n`);
  Bun.spawn(["open", `${d.verification_uri}?otc=${d.user_code}`]);

  while (true) {
    await sleep(d.interval * 1000);
    const t = await postForm("https://login.live.com/oauth20_token.srf", {
      client_id: CLIENT_ID,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: d.device_code,
    });

    if (t.access_token) return [t.access_token, t.refresh_token ?? ""];
    if (t.error === "authorization_pending") continue;
    if (t.error === "slow_down") { await sleep(5000); continue; }
    if (t.error === "expired_token") throw new Error("Code expired. Please try again.");
    throw new Error(t.error_description ?? t.error ?? "Auth failed");
  }
}

async function refreshToken(token: string): Promise<[msToken: string, refreshToken: string]> {
  const t = await postForm("https://login.live.com/oauth20_token.srf", {
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: token,
    scope: "service::user.auth.xboxlive.com::MBI_SSL",
  });
  return [t.access_token, t.refresh_token ?? token];
}

async function msToMinecraft(msToken: string): Promise<{
  mcToken: string; uuid: string; username: string; expiresAt: number;
}> {
  // Xbox Live
  const xbl = await postJson("https://user.auth.xboxlive.com/user/authenticate", {
    Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: msToken },
    RelyingParty: "http://auth.xboxlive.com", TokenType: "JWT",
  });

  // XSTS
  const xsts = await postJson("https://xsts.auth.xboxlive.com/xsts/authorize", {
    Properties: { SandboxId: "RETAIL", UserTokens: [xbl.Token] },
    RelyingParty: "rp://api.minecraftservices.com/", TokenType: "JWT",
  });
  const uhs: string = xsts.DisplayClaims.xui[0].uhs;

  // Minecraft
  const mc = await postJson("https://api.minecraftservices.com/authentication/login_with_xbox", {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`,
  });
  const expiresAt = Math.floor(Date.now() / 1000) + (mc.expires_in ?? 86400);

  // Profile
  const prof = await getJson("https://api.minecraftservices.com/minecraft/profile", {
    Authorization: `Bearer ${mc.access_token}`,
  });

  return { mcToken: mc.access_token, uuid: prof.id, username: prof.name, expiresAt };
}

async function loadCache(): Promise<Partial<AuthCache>> {
  try {
    return await Bun.file(AUTH_CACHE_PATH).json();
  } catch {
    return {};
  }
}

async function saveCache(data: AuthCache) {
  await Bun.write(AUTH_CACHE_PATH, JSON.stringify(data));
  await chmod(AUTH_CACHE_PATH, 0o600);
}

export async function authenticate(): Promise<AuthResult> {
  const cache = await loadCache();

  // Try cached token
  if (cache.access_token && (cache.expires_at ?? 0) > Date.now() / 1000 + 60) {
    return { accessToken: cache.access_token, uuid: cache.uuid!, username: cache.username! };
  }

  // Try refresh
  let msToken: string;
  let refresh: string;
  if (cache.refresh_token) {
    console.error("Refreshing token...");
    try {
      [msToken, refresh] = await refreshToken(cache.refresh_token);
    } catch (e) {
      console.error(`Refresh failed (${e}), need new login.`);
      [msToken, refresh] = await deviceCodeFlow();
    }
  } else {
    [msToken, refresh] = await deviceCodeFlow();
  }

  const { mcToken, uuid, username, expiresAt } = await msToMinecraft(msToken);
  await saveCache({ refresh_token: refresh, access_token: mcToken, uuid, username, expires_at: expiresAt });

  return { accessToken: mcToken, uuid, username };
}

export async function authCommand(opts: { check?: boolean }) {
  if (opts.check) {
    const cache = await loadCache();
    if (cache.access_token && (cache.expires_at ?? 0) > Date.now() / 1000 + 60) {
      const expires = new Date((cache.expires_at ?? 0) * 1000).toISOString();
      console.log(`Token valid. ${cache.username} (${cache.uuid}) expires ${expires}`);
    } else if (cache.refresh_token) {
      console.log("Token expired but refresh token available.");
    } else {
      console.log("No cached auth. Run 'mc-arm64 auth' to log in.");
    }
    return;
  }

  const result = await authenticate();
  console.log(JSON.stringify(result));
}
