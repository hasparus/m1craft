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

/**
 * Return the path to the latest Zulu java binary for a major version, or null.
 *
 * Probes both tarball layouts. Azul releases through 17.64.17 ship top-level
 * convenience symlinks (`<dir>/bin -> zulu-17.jdk/Contents/Home/bin`) so
 * `<dir>/bin/java` resolves. 17.66.19 (Apr 2026) dropped those symlinks and
 * places the JDK directly at `<dir>/Contents/Home/bin/java`.
 */
export async function findZuluJavaBin(javaVersion: string): Promise<string | null> {
  const dirs = await findZuluDirs(javaVersion);
  const latest = dirs.at(-1);
  if (!latest) return null;
  for (const rel of ["bin/java", "Contents/Home/bin/java"]) {
    const candidate = join(JAVA_DIR, latest, rel);
    if (await Bun.file(candidate).exists()) return candidate;
  }
  return null;
}
