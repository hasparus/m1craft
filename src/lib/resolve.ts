import { type } from "arktype";
import { join } from "node:path";

import { ResolveError } from "./errors.js";
import { parseMaven } from "./maven.js";
import { INSTALL, LWJGL_VERSION } from "./paths.js";
import { osMatches } from "./rules.js";

const OsRuleSchema = type({ action: "'allow' | 'disallow'", "os?": { "arch?": "string", "name?": "string", "version?": "string" } });
export type MojangLibraryRule = typeof OsRuleSchema.infer;

const VersionArgumentSchema = type("string").or({ rules: OsRuleSchema.array(), value: type("string").or("string[]") });

const VersionJsonSchema = type({
  "arguments?": { "game?": VersionArgumentSchema.array(), "jvm?": VersionArgumentSchema.array() },
  "assetIndex?": { id: "string" },
  "assets?": "string",
  "id?": "string",
  "inheritsFrom?": "string",
  libraries: type({
    "downloads?": { "artifact?": { "path?": "string" } },
    name: "string",
    "natives?": { "osx?": "string" },
    "rules?": OsRuleSchema.array(),
  }).array(),
  mainClass: "string",
});

type VersionLibrary = typeof VersionJsonSchema.infer.libraries[number];
type VersionArgument = typeof VersionArgumentSchema.infer;

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

const CurseForgeInstanceSchema = type({
  baseModLoader: { "forgeVersion?": "string", name: "string", "type?": "number" },
  gameVersion: "string",
});

async function loadCurseForgeInstance(path: string) {
  const raw = await Bun.file(path).json();
  const result = CurseForgeInstanceSchema(raw);
  if (result instanceof type.errors) throw new ResolveError({ message: `Invalid CurseForge instance at ${path}: ${result.summary}` });
  return result;
}

async function loadVersionJson(path: string) {
  const raw = await Bun.file(path).json();
  const result = VersionJsonSchema(raw);
  if (result instanceof type.errors) throw new ResolveError({ message: `Invalid version JSON at ${path}: ${result.summary}` });
  return result;
}

/** Flatten VersionArgument[] into string[], evaluating conditional entries via osMatches. */
function flattenArgs(args: VersionArgument[]): string[] {
  const result: string[] = [];
  for (const arg of args) {
    if (typeof arg === "string") {
      result.push(arg);
    } else if (osMatches(arg.rules)) {
      if (typeof arg.value === "string") result.push(arg.value);
      else result.push(...arg.value);
    }
  }
  return result;
}

export async function resolveClasspath(
  instanceDir: string,
  installDir: string = INSTALL,
  lwjglVersion: string = LWJGL_VERSION
): Promise<LaunchConfig> {
  const versionsDir = join(installDir, "versions");
  const librariesDir = join(installDir, "libraries");

  const instance = await loadCurseForgeInstance(join(instanceDir, "minecraftinstance.json"));
  const mcVersion = instance.gameVersion;

  // CurseForge stores the loader name as e.g. "fabric-0.18.4-1.20.1", but the
  // on-disk version directory uses the "fabric-loader-" prefix. Forge names
  // match on disk directly. Fall back to the prefixed name if the original
  // doesn't exist.
  let forgeName = instance.baseModLoader.name;
  let forgeJsonPath = join(versionsDir, forgeName, `${forgeName}.json`);
  if (!(await Bun.file(forgeJsonPath).exists()) && forgeName.startsWith("fabric-") && !forgeName.startsWith("fabric-loader-")) {
    const alt = `fabric-loader-${forgeName.slice("fabric-".length)}`;
    const altPath = join(versionsDir, alt, `${alt}.json`);
    if (await Bun.file(altPath).exists()) {
      forgeName = alt;
      forgeJsonPath = altPath;
    }
  }

  const forge = await loadVersionJson(forgeJsonPath);
  const base = await loadVersionJson(join(versionsDir, mcVersion, `${mcVersion}.json`));

  const classpath: string[] = [];
  const seenPaths = new Set<string>();
  // Track group:artifact to let Forge versions override base MC versions
  const seenArtifacts = new Set<string>();

  // Collect Forge artifacts first so we know which ones to skip from base
  const forgeArtifacts = new Set(
    forge.libraries
      .filter((lib) => osMatches(lib.rules) && !lib.natives?.osx)
      .map((lib) => { const c = parseMaven(lib.name); return `${c.group}:${c.artifact}`; })
  );

  function addLib(lib: VersionLibrary, isForge: boolean) {
    if (!osMatches(lib.rules)) return;
    if (lib.natives?.osx) return;

    const coord = parseMaven(lib.name);
    const artifactKey = `${coord.group}:${coord.artifact}`;

    // If base MC provides a library that Forge also provides, skip the base version
    if (!isForge && forgeArtifacts.has(artifactKey)) return;
    if (seenArtifacts.has(artifactKey)) return;
    seenArtifacts.add(artifactKey);

    let { version } = coord;
    if (coord.group === "org.lwjgl") version = lwjglVersion;
    if (coord.artifact === "java-objc-bridge") version = "1.1";

    const dl = lib.downloads?.artifact;
    const needsOverride = coord.group === "org.lwjgl" || coord.artifact === "java-objc-bridge";
    const mavenPath = join(coord.group.replaceAll('.', "/"), coord.artifact, version, `${coord.artifact}-${version}.jar`);
    const jarPath = (dl?.path && !needsOverride)
      ? join(librariesDir, dl.path)
      : join(librariesDir, mavenPath);

    if (!seenPaths.has(jarPath)) {
      seenPaths.add(jarPath);
      classpath.push(jarPath);
    }
  }

  for (const lib of base.libraries) addLib(lib, false);
  for (const lib of forge.libraries) addLib(lib, true);

  // Game jar
  const gameJar = join(versionsDir, forgeName, `${forgeName}.jar`);
  if (await Bun.file(gameJar).exists()) classpath.push(gameJar);

  // Parse Forge JVM args, resolve placeholders
  const jvmArgs: string[] = [];
  let modulePath = "";
  const rawJvm = flattenArgs(forge.arguments?.jvm ?? []);

  const resolvePlaceholders = (s: string) =>
    s
      .replaceAll('${library_directory}', librariesDir)
      .replaceAll('${classpath_separator}', ":")
      .replaceAll('${version_name}', forgeName);

  for (let i = 0; i < rawJvm.length; i++) {
    const arg = resolvePlaceholders(rawJvm[i]!);

    if ((arg === "-p" || arg === "--module-path") && i + 1 < rawJvm.length) {
      modulePath = resolvePlaceholders(rawJvm[i + 1]!);
      i++;
      continue;
    }
    jvmArgs.push(arg);
  }

  const gameArgs = flattenArgs(forge.arguments?.game ?? []);
  const assetIndex = forge.assets ?? base.assetIndex?.id ?? mcVersion;
  const mainClass = forge.mainClass ?? base.mainClass;

  return {
    assetIndex,
    classpath,
    forgeName,
    gameArgs,
    jvmArgs,
    mainClass,
    mcVersion,
    modulePath: modulePath ? modulePath.split(":") : [],
  };
}

