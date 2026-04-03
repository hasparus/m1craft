import { join } from "node:path";
import type { UserConfig } from "./types.js";
import { CF_BASE, CONFIG_PATH } from "./paths.js";

export async function loadConfig(path = CONFIG_PATH): Promise<UserConfig> {
  try {
    return await Bun.file(path).json();
  } catch {
    return {};
  }
}

export async function saveConfig(config: UserConfig, path = CONFIG_PATH): Promise<void> {
  await Bun.write(path, JSON.stringify(config, null, 2) + "\n");
}

export async function discoverInstances(): Promise<string[]> {
  const instancesDir = join(CF_BASE, "Instances");
  const results: string[] = [];
  try {
    for await (const entry of new Bun.Glob("*/minecraftinstance.json").scan(instancesDir)) {
      results.push(entry.replace("/minecraftinstance.json", ""));
    }
  } catch {}
  results.sort();
  return results;
}
