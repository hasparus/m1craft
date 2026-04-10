import { type } from "arktype";
import { isError } from "errore";
import { chmod } from "node:fs/promises";

import { AuthError, HttpError, ValidationError, XboxError } from "./errors.js";
import {
  getAuthCachePath,
  hasAuthCachePathOverride,
  LEGACY_AUTH_CACHE_PATH,
} from "./paths.js";

export interface AuthCache {
  access_token: string;
  expires_at: number;
  refresh_token: string;
  username: string;
  uuid: string;
}

export interface AuthResult {
  accessToken: string;
  username: string;
  uuid: string;
}

const CLIENT_ID = "00000000402b5328";
const TIMEOUT = 15_000;
const MAX_POLL_ITERATIONS = 180; // ~15 min at 5s interval

const MS_CONNECT_URL = "https://login.live.com/oauth20_connect.srf";
const MS_TOKEN_URL = "https://login.live.com/oauth20_token.srf";
const XBL_AUTH_URL = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_AUTH_URL = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_PROFILE_URL = "https://api.minecraftservices.com/minecraft/profile";


const AuthCacheSchema = type({
  "access_token?": "string",
  "expires_at?": "number",
  "refresh_token?": "string",
  "username?": "string",
  "uuid?": "string",
});

const DeviceCodeResponse = type({
  device_code: "string",
  interval: "number",
  user_code: "string",
  verification_uri: "string",
});

const TokenResponse = type({
  access_token: "string",
  "refresh_token?": "string",
});

const TokenErrorResponse = type({
  error: "string",
  "error_description?": "string",
});

const XblResponse = type({
  Token: "string",
});

const XstsResponse = type({
  DisplayClaims: { xui: [{ uhs: "string" }] },
  Token: "string",
});

const XstsErrorResponse = type({
  XErr: "number",
});

const McLoginResponse = type({
  access_token: "string",
  "expires_in?": "number",
});

const McProfileResponse = type({
  id: "string",
  name: "string",
});


function postForm(
  url: string,
  data: Record<string, string>,
): Promise<HttpError | Response> {
  return fetch(url, {
    body: new URLSearchParams(data),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((error) => new HttpError({ cause: error, method: "POST", status: String(error), url }));
}

function postJson(
  url: string,
  data: unknown,
): Promise<HttpError | Response> {
  return fetch(url, {
    body: JSON.stringify(data),
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((error) => new HttpError({ cause: error, method: "POST", status: String(error), url }));
}

function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<HttpError | Response> {
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) }).catch(
    (error) => new HttpError({ cause: error, method: "GET", status: String(error), url }),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


const XBOX_ERROR_REASONS: Record<number, string> = {
  2_148_916_233: "this Microsoft account has no Xbox account — sign up at xbox.com first",
  2_148_916_235: "Xbox Live is not available in your country",
  2_148_916_236: "adult verification required",
  2_148_916_237: "adult verification required",
  2_148_916_238: "child account — a parent must add this account to a Microsoft family",
};

function promptDeviceLogin(userCode: string, verificationUri: string) {
  Bun.spawn(["pbcopy"], { stdin: new Response(userCode).body });
  const box = [
    "",
    "  ┌─────────────────────────────────────────────┐",
    "  │  Microsoft Login                            │",
    "  │                                             │",
    `  │  Your code: ${userCode.padEnd(31)}│`,
    "  │  (copied to clipboard)                      │",
    "  │                                             │",
    "  │  A browser window will open.                │",
    "  │  Paste the code and sign in.                │",
    "  └─────────────────────────────────────────────┘",
    "",
  ];
  for (const line of box) console.error(line);
  Bun.spawn(["open", `${verificationUri}?otc=${userCode}`]);
}

async function deviceCodeFlow(callbacks?: AuthCallbacks): Promise<
  [msToken: string, refreshToken: string] | AuthError
> {
  const res = await postForm(MS_CONNECT_URL, {
    client_id: CLIENT_ID,
    response_type: "device_code",
    scope: "service::user.auth.xboxlive.com::MBI_SSL",
  });
  if (isError(res)) return new AuthError({ cause: res, message: res.message });

  if (!res.ok) {
    return new AuthError({
      cause: new HttpError({ method: "POST", status: String(res.status), url: res.url }),
      message: `Device code request failed (${res.status})`,
    });
  }

  const body = await res.json();
  const d = DeviceCodeResponse(body);
  if (d instanceof type.errors) {
    return new AuthError({
      cause: new ValidationError({ source: "device_code", summary: d.summary }),
      message: `Invalid device code response: ${d.summary}`,
    });
  }

  if (callbacks?.onDeviceCode) {
    callbacks.onDeviceCode(d.user_code, d.verification_uri);
  } else {
    promptDeviceLogin(d.user_code, d.verification_uri);
  }

  for (let attempt = 0; attempt < MAX_POLL_ITERATIONS; attempt++) {
    await sleep(d.interval * 1000);
    const pollRes = await postForm(MS_TOKEN_URL, {
      client_id: CLIENT_ID,
      device_code: d.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (isError(pollRes))
      return new AuthError({ cause: pollRes, message: pollRes.message });

    const pollBody = await pollRes.json();

    // Check for success first
    const token = TokenResponse(pollBody);
    if (!(token instanceof type.errors)) {
      return [token.access_token, token.refresh_token ?? ""];
    }

    // Check for known polling errors
    const err = TokenErrorResponse(pollBody);
    if (!(err instanceof type.errors)) {
      if (err.error === "authorization_pending") continue;
      if (err.error === "slow_down") {
        await sleep(5000);
        continue;
      }
      if (err.error === "expired_token") {
        return new AuthError({ message: "Code expired. Please try again." });
      }
      return new AuthError({
        message: err.error_description ?? err.error ?? "Auth polling failed",
      });
    }

    return new AuthError({ message: "Unexpected token response" });
  }

  return new AuthError({ message: "Device code polling timed out" });
}

async function refreshMsToken(
  token: string,
): Promise<[msToken: string, refreshToken: string] | AuthError> {
  const res = await postForm(MS_TOKEN_URL, {
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: token,
    scope: "service::user.auth.xboxlive.com::MBI_SSL",
  });
  if (isError(res)) return new AuthError({ cause: res, message: res.message });

  if (!res.ok) {
    return new AuthError({
      cause: new HttpError({ method: "POST", status: String(res.status), url: res.url }),
      message: `Token refresh failed (${res.status})`,
    });
  }

  const body = await res.json();
  const t = TokenResponse(body);
  if (t instanceof type.errors) {
    return new AuthError({
      cause: new ValidationError({ source: "refresh", summary: t.summary }),
      message: `Token refresh returned invalid response: ${t.summary}`,
    });
  }

  return [t.access_token, t.refresh_token ?? token];
}

async function msToMinecraft(msToken: string): Promise<
  AuthError | ValidationError | XboxError | { expiresAt: number; mcToken: string; username: string; uuid: string; }
> {
  // Xbox Live
  const xblRes = await postJson(XBL_AUTH_URL, {
    Properties: { AuthMethod: "RPS", RpsTicket: msToken, SiteName: "user.auth.xboxlive.com" },
    RelyingParty: "http://auth.xboxlive.com",
    TokenType: "JWT",
  });
  if (isError(xblRes)) return new AuthError({ cause: xblRes, message: xblRes.message });
  if (!xblRes.ok) {
    return new AuthError({
      cause: new HttpError({ method: "POST", status: String(xblRes.status), url: xblRes.url }),
      message: `Xbox Live auth failed (${xblRes.status})`,
    });
  }
  const xblBody = await xblRes.json();
  const xbl = XblResponse(xblBody);
  if (xbl instanceof type.errors) {
    return new ValidationError({ source: "Xbox Live", summary: xbl.summary });
  }

  // XSTS
  const xstsRes = await postJson(XSTS_AUTH_URL, {
    Properties: { SandboxId: "RETAIL", UserTokens: [xbl.Token] },
    RelyingParty: "rp://api.minecraftservices.com/",
    TokenType: "JWT",
  });
  if (isError(xstsRes)) return new AuthError({ cause: xstsRes, message: xstsRes.message });

  if (!xstsRes.ok) {
    const xstsErrBody = await xstsRes.json().catch(() => null);
    const xstsErr = xstsErrBody ? XstsErrorResponse(xstsErrBody) : null;
    if (xstsErr && !(xstsErr instanceof type.errors)) {
      const reason = XBOX_ERROR_REASONS[xstsErr.XErr] ?? `XSTS error ${xstsErr.XErr}`;
      return new XboxError({ reason });
    }
    return new AuthError({
      cause: new HttpError({ method: "POST", status: String(xstsRes.status), url: xstsRes.url }),
      message: `XSTS auth failed (${xstsRes.status})`,
    });
  }

  const xstsBody = await xstsRes.json();
  const xsts = XstsResponse(xstsBody);
  if (xsts instanceof type.errors) {
    return new ValidationError({ source: "XSTS", summary: xsts.summary });
  }
  const {uhs} = xsts.DisplayClaims.xui[0];

  // Minecraft
  const mcRes = await postJson(
    MC_LOGIN_URL,
    { identityToken: `XBL3.0 x=${uhs};${xsts.Token}` },
  );
  if (isError(mcRes)) return new AuthError({ cause: mcRes, message: mcRes.message });
  if (!mcRes.ok) {
    return new AuthError({
      cause: new HttpError({ method: "POST", status: String(mcRes.status), url: mcRes.url }),
      message: `Minecraft login failed (${mcRes.status})`,
    });
  }

  const mcBody = await mcRes.json();
  const mc = McLoginResponse(mcBody);
  if (mc instanceof type.errors) {
    return new ValidationError({ source: "Minecraft login", summary: mc.summary });
  }
  const expiresAt = Math.floor(Date.now() / 1000) + (mc.expires_in ?? 86_400);

  // Profile
  const profRes = await getJson(MC_PROFILE_URL, {
    Authorization: `Bearer ${mc.access_token}`,
  });
  if (isError(profRes)) return new AuthError({ cause: profRes, message: profRes.message });
  if (!profRes.ok) {
    return new AuthError({
      cause: new HttpError({ method: "GET", status: String(profRes.status), url: profRes.url }),
      message: `Minecraft profile fetch failed (${profRes.status})`,
    });
  }

  const profBody = await profRes.json();
  const prof = McProfileResponse(profBody);
  if (prof instanceof type.errors) {
    return new ValidationError({ source: "Minecraft profile", summary: prof.summary });
  }

  return { expiresAt, mcToken: mc.access_token, username: prof.name, uuid: prof.id };
}


function parseCache(raw: unknown): Partial<AuthCache> {
  const result = AuthCacheSchema(raw);
  return result instanceof type.errors ? {} : result;
}

async function loadCache(): Promise<Partial<AuthCache>> {
  const cachePath = getAuthCachePath();
  try {
    return parseCache(await Bun.file(cachePath).json());
  } catch {
    if (!hasAuthCachePathOverride()) {
      try {
        return parseCache(await Bun.file(LEGACY_AUTH_CACHE_PATH).json());
      } catch { /* fall through */ }
    }
    return {};
  }
}

async function saveCache(data: AuthCache) {
  const cachePath = getAuthCachePath();
  await Bun.write(cachePath, JSON.stringify(data));
  await chmod(cachePath, 0o600);
}


export interface AuthCallbacks {
  onDeviceCode?: (userCode: string, verificationUri: string) => void;
  onStatus?: (status: "cached" | "device-code" | "done" | "refreshing" | "xbox", detail?: string) => void;
}

export async function authenticate(callbacks?: AuthCallbacks): Promise<AuthResult> {
  const cache = await loadCache();

  // Try cached token
  if (cache.access_token && cache.username && cache.uuid && (cache.expires_at ?? 0) > Date.now() / 1000 + 60) {
    callbacks?.onStatus?.("cached", cache.username);
    return { accessToken: cache.access_token, username: cache.username, uuid: cache.uuid };
  }

  // Try refresh, fall back to device code
  let msResult: [string, string] | AuthError;
  if (cache.refresh_token) {
    callbacks?.onStatus?.("refreshing");
    if (!callbacks) console.error("Refreshing login...");
    msResult = await refreshMsToken(cache.refresh_token);
    if (isError(msResult)) {
      if (!callbacks) console.error("Session expired, need to sign in again.");
      callbacks?.onStatus?.("device-code");
      msResult = await deviceCodeFlow(callbacks);
    }
  } else {
    callbacks?.onStatus?.("device-code");
    msResult = await deviceCodeFlow(callbacks);
  }
  if (isError(msResult)) throw msResult;

  callbacks?.onStatus?.("xbox");
  const [msToken, refresh] = msResult;
  const mcResult = await msToMinecraft(msToken);
  if (isError(mcResult)) throw mcResult;

  const { expiresAt, mcToken, username, uuid } = mcResult;
  await saveCache({
    access_token: mcToken,
    expires_at: expiresAt,
    refresh_token: refresh,
    username,
    uuid,
  });

  callbacks?.onStatus?.("done", username);
  return { accessToken: mcToken, username, uuid };
}

export type AuthStatus =
  | { expires: string; status: "valid"; username: string; uuid: string }
  | { status: "expired" }
  | { status: "none" };

export async function checkAuthStatus(): Promise<AuthStatus> {
  const cache = await loadCache();
  if (cache.access_token && cache.username && cache.uuid && (cache.expires_at ?? 0) > Date.now() / 1000 + 60) {
    return { expires: new Date((cache.expires_at ?? 0) * 1000).toISOString(), status: "valid", username: cache.username, uuid: cache.uuid };
  }
  if (cache.refresh_token) return { status: "expired" };
  return { status: "none" };
}
