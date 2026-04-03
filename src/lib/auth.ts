import { chmod } from "node:fs/promises";
import { type } from "arktype";
import { isError } from "errore";
import type { AuthCache, AuthResult } from "./types.js";
import { AUTH_CACHE_PATH } from "./paths.js";
import { HttpError, ValidationError, AuthError, XboxError } from "./errors.js";

const CLIENT_ID = "00000000402b5328";
const TIMEOUT = 15_000;
const MAX_POLL_ITERATIONS = 180; // ~15 min at 5s interval

// -- Response schemas --

const DeviceCodeResponse = type({
  device_code: "string",
  user_code: "string",
  verification_uri: "string",
  interval: "number",
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
  Token: "string",
  DisplayClaims: { xui: [{ uhs: "string" }] },
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

// -- HTTP helpers --

async function postForm(
  url: string,
  data: Record<string, string>,
): Promise<HttpError | Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data),
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((e) => new HttpError({ method: "POST", url, status: `${e}`, cause: e }));
}

async function postJson(
  url: string,
  data: unknown,
): Promise<HttpError | Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((e) => new HttpError({ method: "POST", url, status: `${e}`, cause: e }));
}

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<HttpError | Response> {
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) }).catch(
    (e) => new HttpError({ method: "GET", url, status: `${e}`, cause: e }),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -- Auth flows --

const XBOX_ERROR_REASONS: Record<number, string> = {
  2148916233: "this Microsoft account has no Xbox account — sign up at xbox.com first",
  2148916235: "Xbox Live is not available in your country",
  2148916236: "adult verification required",
  2148916237: "adult verification required",
  2148916238: "child account — a parent must add this account to a Microsoft family",
};

async function deviceCodeFlow(): Promise<
  AuthError | [msToken: string, refreshToken: string]
> {
  const res = await postForm("https://login.live.com/oauth20_connect.srf", {
    client_id: CLIENT_ID,
    scope: "service::user.auth.xboxlive.com::MBI_SSL",
    response_type: "device_code",
  });
  if (isError(res)) return new AuthError({ message: res.message, cause: res });

  if (!res.ok) {
    return new AuthError({
      message: `Device code request failed (${res.status})`,
      cause: new HttpError({ method: "POST", url: res.url, status: `${res.status}` }),
    });
  }

  const body = await res.json();
  const d = DeviceCodeResponse(body);
  if (d instanceof type.errors) {
    return new AuthError({
      message: `Invalid device code response: ${d.summary}`,
      cause: new ValidationError({ source: "device_code", summary: d.summary }),
    });
  }

  // Copy code to clipboard for easy pasting
  Bun.spawn(["pbcopy"], { stdin: new Response(d.user_code).body });

  console.error("");
  console.error("  ┌─────────────────────────────────────────────┐");
  console.error("  │  Microsoft Login                            │");
  console.error("  │                                             │");
  console.error(`  │  Your code: ${d.user_code.padEnd(31)}│`);
  console.error("  │  (copied to clipboard)                      │");
  console.error("  │                                             │");
  console.error("  │  A browser window will open.                │");
  console.error("  │  Paste the code and sign in.                │");
  console.error("  └─────────────────────────────────────────────┘");
  console.error("");

  Bun.spawn(["open", `${d.verification_uri}?otc=${d.user_code}`]);

  for (let attempt = 0; attempt < MAX_POLL_ITERATIONS; attempt++) {
    await sleep(d.interval * 1000);
    const pollRes = await postForm("https://login.live.com/oauth20_token.srf", {
      client_id: CLIENT_ID,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: d.device_code,
    });
    if (isError(pollRes))
      return new AuthError({ message: pollRes.message, cause: pollRes });

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
): Promise<AuthError | [msToken: string, refreshToken: string]> {
  const res = await postForm("https://login.live.com/oauth20_token.srf", {
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: token,
    scope: "service::user.auth.xboxlive.com::MBI_SSL",
  });
  if (isError(res)) return new AuthError({ message: res.message, cause: res });

  if (!res.ok) {
    return new AuthError({
      message: `Token refresh failed (${res.status})`,
      cause: new HttpError({ method: "POST", url: res.url, status: `${res.status}` }),
    });
  }

  const body = await res.json();
  const t = TokenResponse(body);
  if (t instanceof type.errors) {
    return new AuthError({
      message: `Token refresh returned invalid response: ${t.summary}`,
      cause: new ValidationError({ source: "refresh", summary: t.summary }),
    });
  }

  return [t.access_token, t.refresh_token ?? token];
}

async function msToMinecraft(msToken: string): Promise<
  AuthError | XboxError | ValidationError | { mcToken: string; uuid: string; username: string; expiresAt: number }
> {
  // Xbox Live
  const xblRes = await postJson("https://user.auth.xboxlive.com/user/authenticate", {
    Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: msToken },
    RelyingParty: "http://auth.xboxlive.com",
    TokenType: "JWT",
  });
  if (isError(xblRes)) return new AuthError({ message: xblRes.message, cause: xblRes });
  if (!xblRes.ok) {
    return new AuthError({
      message: `Xbox Live auth failed (${xblRes.status})`,
      cause: new HttpError({ method: "POST", url: xblRes.url, status: `${xblRes.status}` }),
    });
  }
  const xblBody = await xblRes.json();
  const xbl = XblResponse(xblBody);
  if (xbl instanceof type.errors) {
    return new ValidationError({ source: "Xbox Live", summary: xbl.summary });
  }

  // XSTS
  const xstsRes = await postJson("https://xsts.auth.xboxlive.com/xsts/authorize", {
    Properties: { SandboxId: "RETAIL", UserTokens: [xbl.Token] },
    RelyingParty: "rp://api.minecraftservices.com/",
    TokenType: "JWT",
  });
  if (isError(xstsRes)) return new AuthError({ message: xstsRes.message, cause: xstsRes });

  if (!xstsRes.ok) {
    const xstsErrBody = await xstsRes.json().catch(() => null);
    const xstsErr = xstsErrBody ? XstsErrorResponse(xstsErrBody) : null;
    if (xstsErr && !(xstsErr instanceof type.errors)) {
      const reason = XBOX_ERROR_REASONS[xstsErr.XErr] ?? `XSTS error ${xstsErr.XErr}`;
      return new XboxError({ reason });
    }
    return new AuthError({
      message: `XSTS auth failed (${xstsRes.status})`,
      cause: new HttpError({ method: "POST", url: xstsRes.url, status: `${xstsRes.status}` }),
    });
  }

  const xstsBody = await xstsRes.json();
  const xsts = XstsResponse(xstsBody);
  if (xsts instanceof type.errors) {
    return new ValidationError({ source: "XSTS", summary: xsts.summary });
  }
  const uhs = xsts.DisplayClaims.xui[0].uhs;

  // Minecraft
  const mcRes = await postJson(
    "https://api.minecraftservices.com/authentication/login_with_xbox",
    { identityToken: `XBL3.0 x=${uhs};${xsts.Token}` },
  );
  if (isError(mcRes)) return new AuthError({ message: mcRes.message, cause: mcRes });
  if (!mcRes.ok) {
    return new AuthError({
      message: `Minecraft login failed (${mcRes.status})`,
      cause: new HttpError({ method: "POST", url: mcRes.url, status: `${mcRes.status}` }),
    });
  }

  const mcBody = await mcRes.json();
  const mc = McLoginResponse(mcBody);
  if (mc instanceof type.errors) {
    return new ValidationError({ source: "Minecraft login", summary: mc.summary });
  }
  const expiresAt = Math.floor(Date.now() / 1000) + (mc.expires_in ?? 86400);

  // Profile
  const profRes = await getJson("https://api.minecraftservices.com/minecraft/profile", {
    Authorization: `Bearer ${mc.access_token}`,
  });
  if (isError(profRes)) return new AuthError({ message: profRes.message, cause: profRes });
  if (!profRes.ok) {
    return new AuthError({
      message: `Minecraft profile fetch failed (${profRes.status})`,
      cause: new HttpError({ method: "GET", url: profRes.url, status: `${profRes.status}` }),
    });
  }

  const profBody = await profRes.json();
  const prof = McProfileResponse(profBody);
  if (prof instanceof type.errors) {
    return new ValidationError({ source: "Minecraft profile", summary: prof.summary });
  }

  return { mcToken: mc.access_token, uuid: prof.id, username: prof.name, expiresAt };
}

// -- Cache --

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

// -- Public API --

export async function authenticate(): Promise<AuthResult> {
  const cache = await loadCache();

  // Try cached token
  if (cache.access_token && (cache.expires_at ?? 0) > Date.now() / 1000 + 60) {
    return { accessToken: cache.access_token, uuid: cache.uuid!, username: cache.username! };
  }

  // Try refresh, fall back to device code
  let msResult: AuthError | [string, string];
  if (cache.refresh_token) {
    console.error("Refreshing login...");
    msResult = await refreshMsToken(cache.refresh_token);
    if (isError(msResult)) {
      console.error("Session expired, need to sign in again.");
      msResult = await deviceCodeFlow();
    }
  } else {
    msResult = await deviceCodeFlow();
  }
  if (isError(msResult)) throw msResult;

  const [msToken, refresh] = msResult;
  const mcResult = await msToMinecraft(msToken);
  if (isError(mcResult)) throw mcResult;

  const { mcToken, uuid, username, expiresAt } = mcResult;
  await saveCache({
    refresh_token: refresh,
    access_token: mcToken,
    uuid,
    username,
    expires_at: expiresAt,
  });

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
  console.log(`Authenticated as ${result.username} (${result.uuid})`);
}
