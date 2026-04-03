import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();

const DEFAULT_AUTH_CACHE_PATH = join(home, ".mc-auth-cache.json");
const DEFAULT_CONFIG_PATH = join(home, ".mc-arm64.json");

export const CF_BASE =
  process.env["CF_BASE"] ?? join(home, "Documents/curseforge/minecraft");
export const INSTALL = join(CF_BASE, "Install");
export const DEFAULT_INSTANCE = join(
  CF_BASE,
  "Instances/Isle of Berk (Claws of Berk)"
);
export const NATIVES_DIR = join(INSTALL, "natives/arm64");
export const AUTH_CACHE_PATH = DEFAULT_AUTH_CACHE_PATH;
export const CONFIG_PATH = DEFAULT_CONFIG_PATH;
export const LWJGL_VERSION = "3.3.3";

export function getAuthCachePath() {
  return process.env["MC_ARM64_AUTH_CACHE_PATH"] ?? DEFAULT_AUTH_CACHE_PATH;
}

export function getConfigPath() {
  return process.env["MC_ARM64_CONFIG_PATH"] ?? DEFAULT_CONFIG_PATH;
}
