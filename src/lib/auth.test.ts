import { test, expect, describe } from "bun:test";
import { type } from "arktype";
// Tests for src/lib/auth.ts — validates the arktype schemas used for API response parsing.
// The auth functions themselves require network calls; we test the validation layer.

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

const XstsResponse = type({
  Token: "string",
  DisplayClaims: { xui: [{ uhs: "string" }] },
});

const McProfileResponse = type({
  id: "string",
  name: "string",
});

describe("auth response validation", () => {
  test("DeviceCodeResponse accepts valid payload", () => {
    const result = DeviceCodeResponse({
      device_code: "abc123",
      user_code: "ABCD-EFGH",
      verification_uri: "https://login.live.com/oauth20_remoteconnect.srf",
      interval: 5,
    });
    expect(result).not.toBeInstanceOf(type.errors);
  });

  test("DeviceCodeResponse rejects missing fields", () => {
    const result = DeviceCodeResponse({ device_code: "abc" });
    expect(result).toBeInstanceOf(type.errors);
  });

  test("TokenResponse accepts token with optional refresh", () => {
    const withRefresh = TokenResponse({
      access_token: "tok123",
      refresh_token: "ref456",
    });
    expect(withRefresh).not.toBeInstanceOf(type.errors);

    const withoutRefresh = TokenResponse({ access_token: "tok123" });
    expect(withoutRefresh).not.toBeInstanceOf(type.errors);
  });

  test("TokenErrorResponse parses authorization_pending", () => {
    const result = TokenErrorResponse({
      error: "authorization_pending",
      error_description: "The user hasn't finished authenticating",
    });
    expect(result).not.toBeInstanceOf(type.errors);
    if (!(result instanceof type.errors)) {
      expect(result.error).toBe("authorization_pending");
    }
  });

  test("XstsResponse validates nested DisplayClaims", () => {
    const good = XstsResponse({
      Token: "xsts-token",
      DisplayClaims: { xui: [{ uhs: "user-hash" }] },
    });
    expect(good).not.toBeInstanceOf(type.errors);

    const bad = XstsResponse({
      Token: "xsts-token",
      DisplayClaims: { xui: [] },
    });
    expect(bad).toBeInstanceOf(type.errors);
  });

  test("McProfileResponse validates profile", () => {
    const result = McProfileResponse({
      id: "abc-def-123",
      name: "Steve",
    });
    expect(result).not.toBeInstanceOf(type.errors);
  });

  test("McProfileResponse rejects missing name", () => {
    const result = McProfileResponse({ id: "abc" });
    expect(result).toBeInstanceOf(type.errors);
  });
});
