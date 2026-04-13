import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  CF_BASE,
  getAuthCachePath,
  getConfigPath,
  INSTALL,
  LEGACY_AUTH_CACHE_PATH,
  LEGACY_CONFIG_PATH,
  LWJGL_FALLBACK_VERSION,
  NATIVES_BASE,
  nativesDirFor,
} from "./paths.js";

const home = homedir();

describe("paths", () => {
  test("CF_BASE defaults to ~/Documents/curseforge/minecraft", () => {
    if (!process.env["CF_BASE"]) {
      expect(CF_BASE).toBe(join(home, "Documents/curseforge/minecraft"));
    }
  });

  test("INSTALL is under CF_BASE", () => {
    expect(INSTALL).toBe(join(CF_BASE, "Install"));
  });

  test("NATIVES_BASE is under INSTALL", () => {
    expect(NATIVES_BASE).toBe(join(INSTALL, "natives/arm64"));
  });

  test("nativesDirFor returns per-version path under NATIVES_BASE", () => {
    expect(nativesDirFor("3.3.1")).toBe(join(NATIVES_BASE, "3.3.1"));
    expect(nativesDirFor("3.3.3")).toBe(join(NATIVES_BASE, "3.3.3"));
  });

  test("getAuthCachePath defaults to ~/.m1craft-auth.json", () => {
    delete process.env["M1CRAFT_AUTH_CACHE_PATH"];
    delete process.env["MC_ARM64_AUTH_CACHE_PATH"];
    expect(getAuthCachePath()).toBe(join(home, ".m1craft-auth.json"));
  });

  test("getAuthCachePath respects env override", () => {
    process.env["M1CRAFT_AUTH_CACHE_PATH"] = "/tmp/auth-cache.json";
    expect(getAuthCachePath()).toBe("/tmp/auth-cache.json");
    delete process.env["M1CRAFT_AUTH_CACHE_PATH"];
  });

  test("legacy auth cache path stays readable", () => {
    expect(LEGACY_AUTH_CACHE_PATH).toBe(join(home, ".mc-auth-cache.json"));
  });

  test("getConfigPath defaults to ~/.m1craft.json", () => {
    delete process.env["M1CRAFT_CONFIG_PATH"];
    delete process.env["MC_ARM64_CONFIG_PATH"];
    expect(getConfigPath()).toBe(join(home, ".m1craft.json"));
  });

  test("getConfigPath respects env override", () => {
    process.env["M1CRAFT_CONFIG_PATH"] = "/tmp/config.json";
    expect(getConfigPath()).toBe("/tmp/config.json");
    delete process.env["M1CRAFT_CONFIG_PATH"];
  });

  test("legacy config path stays readable", () => {
    expect(LEGACY_CONFIG_PATH).toBe(join(home, ".mc-arm64.json"));
  });

  test("LWJGL_FALLBACK_VERSION is a valid semver", () => {
    expect(LWJGL_FALLBACK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
