import { homedir } from "node:os";
import { join } from "node:path";
import { readdir } from "node:fs/promises";

const JAVA_DIR = join(homedir(), "Library/Java");

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

/** Resolve the java binary path for the latest installed Zulu of the given version. */
export async function findJavaBinary(javaVersion: string): Promise<string | null> {
  const entries = await findZuluDirs(javaVersion);
  const match = entries.at(-1);
  if (!match) return null;
  return join(JAVA_DIR, match, "bin/java");
}

export { JAVA_DIR };
