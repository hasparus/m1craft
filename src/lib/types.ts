// Auth
export interface AuthCache {
  access_token: string;
  expires_at: number; // Unix seconds
  refresh_token: string;
  username: string;
  uuid: string;
}

export interface AuthResult {
  accessToken: string;
  username: string;
  uuid: string;
}

// Mojang version manifest
export interface MojangLibraryRule {
  action: "allow" | "disallow";
  os?: { arch?: string; name?: string; version?: string; };
}

export interface MojangLibraryDownload {
  path: string;
  sha1: string;
  size: number;
  url: string;
}

export interface MojangLibrary {
  downloads?: {
    artifact?: MojangLibraryDownload;
    classifiers?: Record<string, MojangLibraryDownload>;
  };
  name: string; // Maven coordinate: "group:artifact:version"
  natives?: Record<string, string>;
  rules?: MojangLibraryRule[];
}

/** A conditional argument entry in the Mojang version JSON format. */
export interface ConditionalArgument {
  rules: MojangLibraryRule[];
  value: string[] | string;
}

/** An argument in the Mojang version JSON — either a plain string or a conditional entry with rules. */
export type VersionArgument = ConditionalArgument | string;

export interface VersionJson {
  arguments?: {
    game?: VersionArgument[];
    jvm?: VersionArgument[];
  };
  assetIndex?: { id: string };
  assets?: string;
  id: string;
  inheritsFrom?: string;
  libraries: MojangLibrary[];
  mainClass: string;
}

export interface CurseForgeInstance {
  baseModLoader: {
    forgeVersion: string;
    name: string;
    type: number;
  };
  gameVersion: string;
}

// Maven coordinate
export interface MavenCoordinate {
  artifact: string;
  classifier?: string;
  group: string;
  version: string;
}

// User config (~/.m1craft.json)
export interface UserConfig {
  defaultInstance?: string;
  height?: number;
  javaVersion?: string; // "17", "21", "8"
  lwjglVersion?: string;
  width?: number;
  xms?: string;
  xmx?: string; // e.g. "8192m"
}

// Resolved launch config
export interface LaunchConfig {
  assetIndex: string;
  classpath: string[];
  forgeName: string;
  gameArgs: string[];
  jvmArgs: string[];
  mainClass: string;
  mcVersion: string;
  modulePath: string[];
}
