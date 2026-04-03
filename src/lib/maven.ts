import type { MavenCoordinate } from "./types.js";

export function parseMaven(coord: string): MavenCoordinate {
  const parts = coord.split(":");
  return {
    group: parts[0]!,
    artifact: parts[1]!,
    version: parts[2]!,
    classifier: parts[3],
  };
}

export function mavenToPath(coord: MavenCoordinate): string {
  const groupPath = coord.group.replace(/\./g, "/");
  const base = `${groupPath}/${coord.artifact}/${coord.version}/${coord.artifact}-${coord.version}`;
  return coord.classifier ? `${base}-${coord.classifier}.jar` : `${base}.jar`;
}
