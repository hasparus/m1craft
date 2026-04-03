import { homedir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";

export const JAVA_DIR = join(homedir(), "Library/Java");

/** Find installed Zulu JDK directories for a given major version. Sorted ascending. */
export async function findZuluDirs(javaVersion: string): Promise<string[]> {
  try {
    const entries = await readdir(JAVA_DIR);
    return entries
      .filter((e) => e.startsWith(`zulu${javaVersion}`) && e.includes("macosx_aarch64"))
      .sort();
  } catch {
    return [];
  }
}
