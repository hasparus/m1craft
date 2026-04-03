import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();

export const CF_BASE =
  process.env["CF_BASE"] ?? join(home, "Documents/curseforge/minecraft");
export const INSTALL = join(CF_BASE, "Install");
export const DEFAULT_INSTANCE = join(
  CF_BASE,
  "Instances/Isle of Berk (Claws of Berk)"
);
export const NATIVES_DIR = join(INSTALL, "natives/arm64");
export const LWJGL_DIR = join(INSTALL, "libraries/org/lwjgl");
export const AUTH_CACHE_PATH = join(home, ".mc-auth-cache.json");
export const CONFIG_PATH = join(home, ".mc-arm64.json");
export const LWJGL_VERSION = "3.3.3";
