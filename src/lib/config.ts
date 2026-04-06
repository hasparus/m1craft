import { type } from "arktype";
import { join } from "node:path";

import {
  CF_BASE,
  getConfigPath,
  hasConfigPathOverride,
  LEGACY_CONFIG_PATH,
} from "./paths.js";

export interface UserConfig {
  defaultInstance?: string;
  height?: number;
  javaVersion?: string;
  lwjglVersion?: string;
  width?: number;
  xms?: string;
  xmx?: string;
}

const UserConfigSchema = type({
  "defaultInstance?": "string",
  "height?": "number",
  "javaVersion?": "string",
  "lwjglVersion?": "string",
  "width?": "number",
  "xms?": "string",
  "xmx?": "string",
});

function parseConfig(raw: unknown): UserConfig {
  const result = UserConfigSchema(raw);
  return result instanceof type.errors ? {} : result;
}

export async function loadConfig(path = getConfigPath()): Promise<UserConfig> {
  try {
    return parseConfig(await Bun.file(path).json());
  } catch {
    if (!hasConfigPathOverride()) {
      try {
        return parseConfig(await Bun.file(LEGACY_CONFIG_PATH).json());
      } catch { /* fall through */ }
    }
    return {};
  }
}

export async function saveConfig(config: UserConfig, path = getConfigPath()): Promise<void> {
  await Bun.write(path, JSON.stringify(config, null, 2) + "\n");
}

export async function loadJavaVersion(path = getConfigPath()): Promise<string> {
  const config = await loadConfig(path);
  return config.javaVersion ?? "17";
}

export async function discoverInstances(): Promise<string[]> {
  const instancesDir = join(CF_BASE, "Instances");
  const results: string[] = [];
  try {
    for await (const entry of new Bun.Glob("*/minecraftinstance.json").scan(instancesDir)) {
      results.push(entry.replace("/minecraftinstance.json", ""));
    }
  } catch { /* dir may not exist */ }
  results.sort((a, b) => a.localeCompare(b));
  return results;
}
