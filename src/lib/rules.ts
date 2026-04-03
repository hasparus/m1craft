import type { MojangLibraryRule } from "./types.js";

export function osMatches(rules?: MojangLibraryRule[]): boolean {
  if (!rules) return true;
  let result = false;
  for (const rule of rules) {
    const action = rule.action === "allow";
    if (rule.os) {
      if (rule.os.name === "osx") result = action;
    } else {
      result = action;
    }
  }
  return result;
}
