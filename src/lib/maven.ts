import type { MavenCoordinate } from "./types.js";

export function parseMaven(coord: string): MavenCoordinate {
  const parts = coord.split(":");
  if (parts.length < 3) {
    throw new Error(`Invalid Maven coordinate (expected group:artifact:version): "${coord}"`);
  }
  return {
    group: parts[0]!,
    artifact: parts[1]!,
    version: parts[2]!,
    classifier: parts[3],
  };
}
