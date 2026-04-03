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

export interface VersionJson {
  id: string;
  inheritsFrom?: string;
  mainClass: string;
  libraries: MojangLibrary[];
  arguments?: {
    jvm?: string[];
    game?: string[];
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

// User config (~/.mc-arm64.json)
export interface UserConfig {
  defaultInstance?: string;
  xmx?: string; // e.g. "8192m"
  xms?: string;
  width?: number;
  height?: number;
  lwjglVersion?: string;
}
