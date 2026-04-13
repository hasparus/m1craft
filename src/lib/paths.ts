import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();

const DEFAULT_AUTH_CACHE_PATH = join(home, ".m1craft-auth.json");
const DEFAULT_CONFIG_PATH = join(home, ".m1craft.json");

export const CF_BASE =
  process.env["CF_BASE"] ?? join(home, "Documents/curseforge/minecraft");
export const INSTALL = join(CF_BASE, "Install");
export const DEFAULT_INSTANCE = join(
  CF_BASE,
  "Instances/Isle of Berk (Claws of Berk)"
);
export const NATIVES_BASE = join(INSTALL, "natives/arm64");
export const LEGACY_AUTH_CACHE_PATH = join(home, ".mc-auth-cache.json");
export const LEGACY_CONFIG_PATH = join(home, ".mc-arm64.json");

/** Per-LWJGL-version natives directory. Lets multiple LWJGL versions coexist. */
export function nativesDirFor(lwjglVersion: string): string {
  return join(NATIVES_BASE, lwjglVersion);
}

/**
 * Fallback LWJGL version used when the base MC version JSON declares
 * LWJGL < 3.3.0 (those releases don't publish macos-arm64 classifier
 * natives on Maven Central). Must therefore be >= 3.3.0. Known to work
 * with MC 1.16–1.18.x modpacks (Berk on 1.18.2 is the regression test).
 * Bump when a newer LWJGL is verified against the same range.
 */
export const LWJGL_FALLBACK_VERSION = "3.3.3";

export function getAuthCachePath() {
  return process.env["M1CRAFT_AUTH_CACHE_PATH"]
    ?? process.env["MC_ARM64_AUTH_CACHE_PATH"]
    ?? DEFAULT_AUTH_CACHE_PATH;
}

export function getConfigPath() {
  return process.env["M1CRAFT_CONFIG_PATH"]
    ?? process.env["MC_ARM64_CONFIG_PATH"]
    ?? DEFAULT_CONFIG_PATH;
}

export function hasAuthCachePathOverride() {
  return !!(process.env["M1CRAFT_AUTH_CACHE_PATH"] ?? process.env["MC_ARM64_AUTH_CACHE_PATH"]);
}

export function hasConfigPathOverride() {
  return !!(process.env["M1CRAFT_CONFIG_PATH"] ?? process.env["MC_ARM64_CONFIG_PATH"]);
}
