import { type } from "arktype";
import { join } from "node:path";

import { ResolveError } from "./errors.js";
import { parseMaven } from "./maven.js";
import { INSTALL, LWJGL_FALLBACK_VERSION } from "./paths.js";
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

type VersionJson = typeof VersionJsonSchema.infer;
type VersionLibrary = typeof VersionJsonSchema.infer.libraries[number];
type VersionArgument = typeof VersionArgumentSchema.infer;

export interface LaunchConfig {
  assetIndex: string;
  classpath: string[];
  forgeName: string;
  gameArgs: string[];
  instanceDir: string;
  jvmArgs: string[];
  lwjglVersion: string;
  mainClass: string;
  mcVersion: string;
  modulePath: string[];
}

const CurseForgeInstanceSchema = type({
  baseModLoader: { "forgeVersion?": "string", name: "string", "type?": "number" },
  gameVersion: "string",
});

/**
 * Recursively strip null values so arktype's "field?" optional fields accept
 * them. CurseForge-shipped Forge/Fabric version JSONs serialize absent
 * optional fields as explicit nulls — e.g. library entries with
 * `"natives":null`, `"rules":null`, or `"downloads":{"artifact":null}` —
 * and arktype treats `?` as "missing", not "missing or null", so raw
 * validation rejected every real-world version JSON. Null array elements
 * are dropped for symmetry with null object values; we haven't seen
 * meaningful null array elements in the wild.
 */
function stripNulls(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map(stripNulls).filter((v) => v !== undefined);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const stripped = stripNulls(v);
      if (stripped !== undefined) out[k] = stripped;
    }
    return out;
  }
  return value;
}

async function loadCurseForgeInstance(path: string) {
  // Unlike version JSONs, CF instance JSONs haven't been observed with
  // null baseModLoader fields in real-world samples (Berk/Forge 1.18.2,
  // Otherworld/Forge 1.20.1, Vanilla with Voxy/Fabric 26.1 all have
  // non-null name/forgeVersion/type/gameVersion as of 2026-04). If a user
  // reports an arktype error here, re-add stripNulls to this function.
  const raw = await Bun.file(path).json();
  const result = CurseForgeInstanceSchema(raw);
  if (result instanceof type.errors) throw new ResolveError({ message: `Invalid CurseForge instance at ${path}: ${result.summary}` });
  return result;
}

async function loadVersionJson(path: string) {
  const raw = stripNulls(await Bun.file(path).json());
  const result = VersionJsonSchema(raw);
  if (result instanceof type.errors) throw new ResolveError({ message: `Invalid version JSON at ${path}: ${result.summary}` });
  return result;
}

interface ParsedVersion {
  numeric: number[];
  /** Non-empty for pre-release/letter-suffixed releases (e.g. "a" in "3.0.0a", "-SNAPSHOT" in "3.3.3-SNAPSHOT"). */
  suffix: string;
}

/**
 * Split a LWJGL version string into a numeric tuple and an optional suffix.
 * Intentionally permissive — acts as a comparison key; callers validate
 * shape up-front (see validator regex in resolveClasspath for overrides).
 * Handles real Maven Central cases: strict "3.3.3" and letter alphas
 * "3.0.0a"/"3.0.0b", plus semver-style "-SNAPSHOT"/"-rc1" suffixes.
 */
export function parseLwjglVersion(v: string): ParsedVersion {
  const m = /^(\d+(?:\.\d+)*)(.*)$/.exec(v);
  if (!m) return { numeric: [0], suffix: v };
  return {
    numeric: m[1]!.split(".").map((n) => Number(n) || 0),
    suffix: m[2] ?? "",
  };
}

/** Split a suffix into alternating digit / non-digit tokens for natural-sort compare. */
function tokenizeSuffix(s: string): (number | string)[] {
  const tokens: (number | string)[] = [];
  const re = /(\d+)|(\D+)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1] === undefined) {tokens.push(m[2]!);}
    else {tokens.push(Number(m[1]));}
  }
  return tokens;
}

/**
 * Compare two LWJGL version strings. Numeric components compare first. On
 * a tie, an empty suffix (stable) sorts GREATER than any non-empty suffix
 * (pre-release). When both have suffixes, natural-sort tokenizes each:
 * digit runs compare numerically (so "rc10" > "rc2"), non-digit runs
 * lexically, digit runs beat non-digit runs. This matches both semver
 * convention (3.3.3 > 3.3.3-SNAPSHOT) and LWJGL's actual release order
 * (3.0.0 > 3.0.0b > 3.0.0a — alphas shipped first, stable came last).
 */
export function compareLwjglVersion(a: string, b: string): number {
  const pa = parseLwjglVersion(a);
  const pb = parseLwjglVersion(b);
  const len = Math.max(pa.numeric.length, pb.numeric.length);
  for (let i = 0; i < len; i++) {
    const da = pa.numeric[i] ?? 0;
    const db = pb.numeric[i] ?? 0;
    if (da !== db) return da - db;
  }
  if (pa.suffix === pb.suffix) return 0;
  if (pa.suffix === "") return 1;
  if (pb.suffix === "") return -1;
  const ta = tokenizeSuffix(pa.suffix);
  const tb = tokenizeSuffix(pb.suffix);
  const tlen = Math.max(ta.length, tb.length);
  for (let i = 0; i < tlen; i++) {
    const xa = ta[i];
    const xb = tb[i];
    if (xa === undefined) return -1;
    if (xb === undefined) return 1;
    if (typeof xa === "number" && typeof xb === "number") {
      if (xa !== xb) return xa - xb;
    } else if (typeof xa === "number") {
      return 1;
    } else if (typeof xb === "number") {
      return -1;
    } else if (xa !== xb) {
      return xa < xb ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Pick the LWJGL version to substitute for org.lwjgl:* libraries.
 *
 * Strategy: take the highest org.lwjgl:lwjgl version found in the base MC
 * version JSON. If that's < 3.3.0 (no ARM64 macOS natives, e.g. MC 1.18.2
 * ships 3.2.2), upgrade to LWJGL_FALLBACK_VERSION. Otherwise use it as-is so
 * that mods like Sodium — which strict-check the LWJGL minor version at
 * runtime — see the version they were compiled against.
 */
function detectLwjglVersion(base: VersionJson): string {
  let max = "";
  for (const lib of base.libraries) {
    const coord = parseMaven(lib.name);
    if (coord.group !== "org.lwjgl" || coord.artifact !== "lwjgl") continue;
    if (!max || compareLwjglVersion(coord.version, max) > 0) max = coord.version;
  }
  if (!max || compareLwjglVersion(max, "3.3.0") < 0) return LWJGL_FALLBACK_VERSION;
  return max;
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
  lwjglOverride?: string
): Promise<LaunchConfig> {
  if (lwjglOverride !== undefined && !/^\d+\.\d+\.\d+[A-Za-z0-9.-]*$/.test(lwjglOverride)) {
    throw new ResolveError({
      message: `Invalid lwjglVersion in config: "${lwjglOverride}". Expected MAJOR.MINOR.PATCH with optional suffix (e.g. "3.3.3", "3.0.0a", "3.3.3-SNAPSHOT").`,
    });
  }

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

  const lwjglVersion = lwjglOverride ?? detectLwjglVersion(base);

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
    instanceDir,
    jvmArgs,
    lwjglVersion,
    mainClass,
    mcVersion,
    modulePath: modulePath ? modulePath.split(":") : [],
  };
}

