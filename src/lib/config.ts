import { join } from "node:path";
import type { UserConfig } from "./types.js";
import { CF_BASE, CONFIG_PATH } from "./paths.js";

export async function loadConfig(): Promise<UserConfig> {
  try {
    return await Bun.file(CONFIG_PATH).json();
  } catch {
    return {};
  }
}

export async function saveConfig(config: UserConfig): Promise<void> {
  await Bun.write(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export async function discoverInstances(): Promise<string[]> {
  const instancesDir = join(CF_BASE, "Instances");
  const results: string[] = [];
  try {
    for await (const entry of new Bun.Glob("*/minecraftinstance.json").scan(instancesDir)) {
      // entry is "Pack Name/minecraftinstance.json" — extract the dir name
      const dir = entry.replace("/minecraftinstance.json", "");
      results.push(dir);
    }
  } catch {
    // Instances dir doesn't exist
  }
  results.sort();
  return results;
}
