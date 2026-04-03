import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { authenticate } from "./auth.js";
import { getAuthCachePath } from "./paths.js";

const MOCK_MC_TOKEN = "mock-mc-access-token";
const MOCK_UUID = "abcdef1234567890abcdef1234567890";
const MOCK_USERNAME = "TestPlayer";
const TEST_AUTH_CACHE_PATH = "/tmp/mc-arm64-auth-cache.json";

// Track which endpoints get called
let callLog: string[] = [];

const handlers = [
  // Microsoft device code
  http.post("https://login.live.com/oauth20_connect.srf", () => {
    callLog.push("POST msConnect");
    return HttpResponse.json({
      device_code: "mock-device-code",
      interval: 0,
      user_code: "ABCD-1234",
      verification_uri: "https://example.com/device",
    });
  }),

  // Microsoft token exchange
  http.post("https://login.live.com/oauth20_token.srf", async ({ request }) => {
    const body = await request.text();
    if (body.includes("device_code")) {
      callLog.push("POST msToken (device)");
    } else if (body.includes("refresh_token")) {
      callLog.push("POST msToken (refresh)");
    }
    return HttpResponse.json({
      access_token: "mock-ms-token",
      refresh_token: "mock-refresh-token",
    });
  }),

  // Xbox Live
  http.post("https://user.auth.xboxlive.com/user/authenticate", () => {
    callLog.push("POST xbl");
    return HttpResponse.json({ Token: "mock-xbl-token" });
  }),

  // XSTS
  http.post("https://xsts.auth.xboxlive.com/xsts/authorize", () => {
    callLog.push("POST xsts");
    return HttpResponse.json({
      DisplayClaims: { xui: [{ uhs: "1234567890" }] },
      Token: "mock-xsts-token",
    });
  }),

  // Minecraft login
  http.post("https://api.minecraftservices.com/authentication/login_with_xbox", () => {
    callLog.push("POST mcLogin");
    return HttpResponse.json({
      access_token: MOCK_MC_TOKEN,
      expires_in: 86_400,
    });
  }),

  // Minecraft profile
  http.get("https://api.minecraftservices.com/minecraft/profile", () => {
    callLog.push("GET mcProfile");
    return HttpResponse.json({ id: MOCK_UUID, name: MOCK_USERNAME });
  }),
];

const server = setupServer(...handlers);

beforeAll(() => {
  process.env["MC_ARM64_AUTH_CACHE_PATH"] = TEST_AUTH_CACHE_PATH;
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(async () => {
  callLog = [];
  server.resetHandlers();
  await clearCache();
});
afterAll(async () => {
  server.close();
  delete process.env["MC_ARM64_AUTH_CACHE_PATH"];
  try { await Bun.file(TEST_AUTH_CACHE_PATH).unlink(); } catch { /* ok */ }
});

async function clearCache() {
  try { await Bun.file(getAuthCachePath()).unlink(); } catch { /* ok */ }
}

async function seedCache() {
  await Bun.write(
    getAuthCachePath(),
    JSON.stringify({
      access_token: MOCK_MC_TOKEN,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: "mock-refresh-token",
      username: MOCK_USERNAME,
      uuid: MOCK_UUID,
    }),
  );
}

const noopCallbacks = {
  onDeviceCode() { /* suppress browser open */ },
  onStatus() { /* suppress console output */ },
};

describe("authenticate", () => {
  test("full device code flow returns valid auth result", async () => {
    await clearCache();
    callLog = [];

    const result = await authenticate(noopCallbacks);

    expect(result.accessToken).toBe(MOCK_MC_TOKEN);
    expect(result.username).toBe(MOCK_USERNAME);
    expect(result.uuid).toBe(MOCK_UUID);
  });

  test("device code flow hits all 6 endpoints in order", async () => {
    await authenticate(noopCallbacks);

    expect(callLog).toEqual([
      "POST msConnect",
      "POST msToken (device)",
      "POST xbl",
      "POST xsts",
      "POST mcLogin",
      "GET mcProfile",
    ]);
  });

  test("cached token is returned without network calls", async () => {
    await seedCache();
    callLog = [];
    const result = await authenticate(noopCallbacks);

    expect(result.accessToken).toBe(MOCK_MC_TOKEN);
    expect(result.username).toBe(MOCK_USERNAME);
    expect(callLog).toEqual([]);
  });

  test("calls onStatus callbacks during flow", async () => {
    await clearCache();
    const statuses: string[] = [];

    await authenticate({
      onDeviceCode() { /* noop */ },
      onStatus(status) { statuses.push(status); },
    });

    expect(statuses).toContain("device-code");
    expect(statuses).toContain("xbox");
    expect(statuses).toContain("done");
  });

  test("calls onDeviceCode with user code", async () => {
    await clearCache();
    let receivedCode = "";

    await authenticate({
      onDeviceCode(code) { receivedCode = code; },
      onStatus() { /* noop */ },
    });

    expect(receivedCode).toBe("ABCD-1234");
  });

  test("throws on Xbox Live server error", async () => {
    await clearCache();

    server.use(
      http.post("https://user.auth.xboxlive.com/user/authenticate", () =>
        new HttpResponse("Server Error", { status: 500 }),
      ),
    );

    expect(authenticate(noopCallbacks)).rejects.toThrow("Xbox Live auth failed");
  });

  test("throws on Minecraft login failure", async () => {
    await clearCache();

    server.use(
      http.post("https://api.minecraftservices.com/authentication/login_with_xbox", () =>
        new HttpResponse("Unauthorized", { status: 401 }),
      ),
    );

    expect(authenticate(noopCallbacks)).rejects.toThrow("Minecraft login failed");
  });
});
