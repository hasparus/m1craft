import { join } from "node:path";
import type {
  CurseForgeInstance,
  LaunchConfig,
  MojangLibrary,
  VersionArgument,
  VersionJson,
} from "./types.js";
import { INSTALL, LWJGL_VERSION } from "./paths.js";
import { parseMaven } from "./maven.js";
import { osMatches } from "./rules.js";

async function loadJson<T>(path: string): Promise<T> {
  return Bun.file(path).json();
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

  const instance = await loadJson<CurseForgeInstance>(
    join(instanceDir, "minecraftinstance.json")
  );
  const forgeName = instance.baseModLoader.name;
  const mcVersion = instance.gameVersion;

  const forge = await loadJson<VersionJson>(
    join(versionsDir, forgeName, `${forgeName}.json`)
  );
  const base = await loadJson<VersionJson>(
    join(versionsDir, mcVersion, `${mcVersion}.json`)
  );

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

  function addLib(lib: MojangLibrary, isForge: boolean) {
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
    let jarPath: string;

    if (dl?.path && coord.group === "org.lwjgl") {
      jarPath = join(librariesDir, "org/lwjgl", coord.artifact, version, `${coord.artifact}-${version}.jar`);
    } else if (dl?.path && coord.artifact === "java-objc-bridge") {
      jarPath = join(librariesDir, coord.group.replace(/\./g, "/"), coord.artifact, version, `${coord.artifact}-${version}.jar`);
    } else if (dl?.path) {
      jarPath = join(librariesDir, dl.path);
    } else {
      jarPath = join(librariesDir, coord.group.replace(/\./g, "/"), coord.artifact, version, `${coord.artifact}-${version}.jar`);
    }

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
      .replace(/\$\{library_directory}/g, librariesDir)
      .replace(/\$\{classpath_separator}/g, ":")
      .replace(/\$\{version_name}/g, forgeName);

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
    classpath,
    modulePath: modulePath ? modulePath.split(":") : [],
    jvmArgs,
    gameArgs,
    mainClass,
    assetIndex,
    forgeName,
    mcVersion,
  };
}

export async function resolveCommand(opts: { instance?: string }) {
  const instanceDir = opts.instance ?? (await import("./paths.js")).DEFAULT_INSTANCE;
  const config = await resolveClasspath(instanceDir);
  console.log(JSON.stringify(config, null, 2));
}
