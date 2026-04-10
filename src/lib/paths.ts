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
 * Used when the base MC version ships LWJGL < 3.3.0 (no ARM64 macOS natives).
 * Picked because LWJGL 3.3.3 was the original m1craft target and is known
 * to work with MC 1.16–1.18.x modpacks.
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
