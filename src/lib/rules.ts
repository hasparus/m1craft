import type { MojangLibraryRule } from "./types.js";

/**
 * Evaluate Mojang-style OS rules for macOS ARM64.
 * Returns true if the library should be included on this platform.
 *
 * Rule semantics (per Mojang spec):
 * - No rules → include everywhere
 * - Each rule sets `result` if its conditions match (or if it has no conditions)
 * - Rules are evaluated in order; last matching rule wins
 * - OS name "osx" matches macOS
 * - Arch "aarch64" matches ARM64 (this is what we're running on)
 */
export function osMatches(rules?: MojangLibraryRule[]): boolean {
  if (!rules) return true;

  let result = false;
  for (const rule of rules) {
    const action = rule.action === "allow";

    if (!rule.os) {
      // No OS constraint — this rule applies unconditionally
      result = action;
      continue;
    }

    // Check OS name: only "osx" matches macOS
    if (rule.os.name && rule.os.name !== "osx") continue;

    // Check arch: map Mojang arch names to what we're running
    // Mojang uses "x86" (32-bit), "x86_64" (Intel 64-bit), "aarch64" is not
    // used in vanilla but could appear in modded JSONs.
    // On ARM64 macOS, process.arch is "arm64".
    if (rule.os.arch) {
      const arch = rule.os.arch;
      // We're ARM64 — skip rules that only apply to x86/x86_64
      if (arch === "x86" || arch === "x86_64") continue;
      // Only match if the rule explicitly targets arm64/aarch64
      if (arch !== "arm64" && arch !== "aarch64") continue;
    }

    result = action;
  }
  return result;
}
