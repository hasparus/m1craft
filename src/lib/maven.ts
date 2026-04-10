export interface MavenCoordinate {
  artifact: string;
  classifier?: string;
  group: string;
  version: string;
}

export function parseMaven(coord: string): MavenCoordinate {
  const parts = coord.split(":");
  if (parts.length < 3) {
    throw new Error(`Invalid Maven coordinate (expected group:artifact:version): "${coord}"`);
  }
  return {
    artifact: parts[1]!,
    classifier: parts[3],
    group: parts[0]!,
    version: parts[2]!,
  };
}
