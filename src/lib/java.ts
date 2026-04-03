import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const JAVA_DIR = join(homedir(), "Library/Java");

/** Find installed Zulu JDK directories for a given major version. Sorted ascending. */
export async function findZuluDirs(javaVersion: string): Promise<string[]> {
  try {
    const entries = await readdir(JAVA_DIR);
    return entries
      .filter((e) => e.startsWith(`zulu${javaVersion}`) && e.includes("macosx_aarch64"))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Return the path to the latest Zulu java binary for a major version, or null. */
export async function findZuluJavaBin(javaVersion: string): Promise<string | null> {
  const dirs = await findZuluDirs(javaVersion);
  const latest = dirs.at(-1);
  return latest ? join(JAVA_DIR, latest, "bin/java") : null;
}
