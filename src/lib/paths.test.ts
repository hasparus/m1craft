import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  AUTH_CACHE_PATH,
  CF_BASE,
  CONFIG_PATH,
  getAuthCachePath,
  getConfigPath,
  INSTALL,
  LEGACY_AUTH_CACHE_PATH,
  LEGACY_CONFIG_PATH,
  LWJGL_VERSION,
  NATIVES_DIR,
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

  test("NATIVES_DIR is under INSTALL", () => {
    expect(NATIVES_DIR).toBe(join(INSTALL, "natives/arm64"));
  });

  test("AUTH_CACHE_PATH uses the m1craft name", () => {
    expect(AUTH_CACHE_PATH).toBe(join(home, ".m1craft-auth.json"));
  });

  test("getAuthCachePath respects env override", () => {
    process.env["M1CRAFT_AUTH_CACHE_PATH"] = "/tmp/auth-cache.json";
    expect(getAuthCachePath()).toBe("/tmp/auth-cache.json");
    delete process.env["M1CRAFT_AUTH_CACHE_PATH"];
  });

  test("legacy auth cache path stays readable", () => {
    expect(LEGACY_AUTH_CACHE_PATH).toBe(join(home, ".mc-auth-cache.json"));
  });

  test("CONFIG_PATH uses the m1craft name", () => {
    expect(CONFIG_PATH).toBe(join(home, ".m1craft.json"));
  });

  test("getConfigPath respects env override", () => {
    process.env["M1CRAFT_CONFIG_PATH"] = "/tmp/config.json";
    expect(getConfigPath()).toBe("/tmp/config.json");
    delete process.env["M1CRAFT_CONFIG_PATH"];
  });

  test("legacy config path stays readable", () => {
    expect(LEGACY_CONFIG_PATH).toBe(join(home, ".mc-arm64.json"));
  });

  test("LWJGL_VERSION is a valid semver", () => {
    expect(LWJGL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
