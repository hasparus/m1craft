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

  test("AUTH_CACHE_PATH is in home dir", () => {
    expect(AUTH_CACHE_PATH).toBe(join(home, ".mc-auth-cache.json"));
  });

  test("getAuthCachePath respects env override", () => {
    process.env["MC_ARM64_AUTH_CACHE_PATH"] = "/tmp/auth-cache.json";
    expect(getAuthCachePath()).toBe("/tmp/auth-cache.json");
    delete process.env["MC_ARM64_AUTH_CACHE_PATH"];
  });

  test("CONFIG_PATH is in home dir", () => {
    expect(CONFIG_PATH).toBe(join(home, ".mc-arm64.json"));
  });

  test("getConfigPath respects env override", () => {
    process.env["MC_ARM64_CONFIG_PATH"] = "/tmp/config.json";
    expect(getConfigPath()).toBe("/tmp/config.json");
    delete process.env["MC_ARM64_CONFIG_PATH"];
  });

  test("LWJGL_VERSION is a valid semver", () => {
    expect(LWJGL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
