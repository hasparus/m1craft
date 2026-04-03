import { join } from "node:path";

import type { UserConfig } from "./types.js";

import { CF_BASE, getConfigPath } from "./paths.js";

export async function loadConfig(path = getConfigPath()): Promise<UserConfig> {
  try {
    return await Bun.file(path).json();
  } catch {
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
