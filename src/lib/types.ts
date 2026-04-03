// Auth
export interface AuthCache {
  refresh_token: string;
  access_token: string;
  uuid: string;
  username: string;
  expires_at: number; // Unix seconds
}

export interface AuthResult {
  accessToken: string;
  uuid: string;
  username: string;
}

// Mojang version manifest
export interface MojangLibraryRule {
  action: "allow" | "disallow";
  os?: { name?: string; version?: string; arch?: string };
}

export interface MojangLibraryDownload {
  path: string;
  url: string;
  sha1: string;
  size: number;
}

export interface MojangLibrary {
  name: string; // Maven coordinate: "group:artifact:version"
  downloads?: {
    artifact?: MojangLibraryDownload;
    classifiers?: Record<string, MojangLibraryDownload>;
  };
  rules?: MojangLibraryRule[];
  natives?: Record<string, string>;
}

/** A conditional argument entry in the Mojang version JSON format. */
export interface ConditionalArgument {
  rules: MojangLibraryRule[];
  value: string | string[];
}

/** An argument in the Mojang version JSON — either a plain string or a conditional entry with rules. */
export type VersionArgument = string | ConditionalArgument;

export interface VersionJson {
  id: string;
  inheritsFrom?: string;
  mainClass: string;
  libraries: MojangLibrary[];
  arguments?: {
    jvm?: VersionArgument[];
    game?: VersionArgument[];
  };
  assets?: string;
  assetIndex?: { id: string };
}

export interface CurseForgeInstance {
  gameVersion: string;
  baseModLoader: {
    name: string;
    forgeVersion: string;
    type: number;
  };
}

// Maven coordinate
export interface MavenCoordinate {
  group: string;
  artifact: string;
  version: string;
  classifier?: string;
}

// User config (~/.mc-arm64.json)
export interface UserConfig {
  defaultInstance?: string;
  xmx?: string; // e.g. "8192m"
  xms?: string;
  width?: number;
  height?: number;
  lwjglVersion?: string;
}

// Resolved launch config
export interface LaunchConfig {
  classpath: string[];
  modulePath: string[];
  jvmArgs: string[];
  gameArgs: string[];
  mainClass: string;
  assetIndex: string;
  forgeName: string;
  mcVersion: string;
}
