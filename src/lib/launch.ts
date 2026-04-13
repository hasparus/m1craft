import { join } from "node:path";

import type { AuthCallbacks, AuthResult } from "./auth.js";
import type { LaunchConfig } from "./resolve.js";

import { authenticate } from "./auth.js";
import { loadConfig } from "./config.js";
import { LaunchError } from "./errors.js";
import { findZuluJavaBin } from "./java.js";
import { CF_BASE, DEFAULT_INSTANCE, INSTALL, nativesDirFor } from "./paths.js";
import { resolveClasspath } from "./resolve.js";

/**
 * Pick the instance directory from an explicit override, then the saved
 * default modpack, then the hardcoded default. Used in both main.ts (to
 * resolve before setup knows which LWJGL version to install) and here (when
 * called without a pre-resolved classpath).
 */
export function resolveInstanceDir(
  instanceArg: string | undefined,
  defaultInstanceName: string | undefined,
): string {
  if (instanceArg) return instanceArg;
  if (defaultInstanceName) return join(CF_BASE, "Instances", defaultInstanceName);
  return DEFAULT_INSTANCE;
}

export type LaunchStep = "auth" | "classpath" | "config" | "java" | "launch";

export interface LaunchCallbacks {
  auth?: AuthCallbacks;
  onStep?: (step: LaunchStep, detail?: string) => void;
}

export interface LaunchResult {
  auth: AuthResult;
  cmd: string[];
  forgeName: string;
  instanceDir: string;
  lwjglVersion: string;
}

/**
 * Resolve everything needed to launch Minecraft. Does not spawn or print.
 * If `opts.resolved` is provided, the classpath resolution step is skipped
 * (the caller already did it — typically to know the LWJGL version before
 * running setup). When `opts.resolved` is set, `opts.instance` is ignored;
 * the instance directory is read from `opts.resolved.instanceDir`.
 */
export async function prepareLaunch(
  opts: { installDir?: string; instance?: string; resolved?: LaunchConfig; },
  callbacks?: LaunchCallbacks,
): Promise<LaunchResult> {
  callbacks?.onStep?.("config");
  const config = await loadConfig();

  const installDir = opts.installDir ?? INSTALL;

  callbacks?.onStep?.("java");
  const javaVersion = config.javaVersion ?? "17";
  const java = await findZuluJavaBin(javaVersion);
  if (!java) throw new LaunchError({ message: `Zulu ${javaVersion} ARM not found. Run 'm1craft setup' first.` });

  callbacks?.onStep?.("auth");
  const auth = await authenticate(callbacks?.auth);

  callbacks?.onStep?.("classpath");
  // config.lwjglVersion is a manual override; otherwise resolveClasspath
  // auto-detects from the base MC version JSON.
  const resolved = opts.resolved ?? await resolveClasspath(
    resolveInstanceDir(opts.instance, config.defaultInstance),
    installDir,
    config.lwjglVersion,
  );
  const { instanceDir } = resolved;
  callbacks?.onStep?.("launch", resolved.forgeName);

  const nativesDir = nativesDirFor(resolved.lwjglVersion);

  const xmx = config.xmx ?? "8192m";
  const xms = config.xms ?? "256m";
  const width = String(config.width ?? 1024);
  const height = String(config.height ?? 768);

  const cmd = [
    java,
    "-XstartOnFirstThread", "-Xss1M",
    `-Dorg.lwjgl.librarypath=${nativesDir}`,
    `-Djava.library.path=${nativesDir}`,
    "-Dfml.earlyprogresswindow=false",
    "-Dminecraft.launcher.brand=m1craft",
    ...resolved.jvmArgs,
    "-cp", resolved.classpath.join(":"),
    ...(resolved.modulePath.length > 0
      ? ["-p", resolved.modulePath.join(":"), "--add-modules", "ALL-MODULE-PATH"]
      : []),
    "--add-opens", "java.base/java.util.jar=cpw.mods.securejarhandler",
    "--add-opens", "java.base/java.lang.invoke=cpw.mods.securejarhandler",
    "--add-exports", "java.base/sun.security.util=cpw.mods.securejarhandler",
    "--add-exports", "jdk.naming.dns/com.sun.jndi.dns=java.naming",
    `-Xmx${xmx}`, `-Xms${xms}`,
    "-Dfml.ignorePatchDiscrepancies=true",
    "-Dfml.ignoreInvalidMinecraftCertificates=true",
    "-Duser.language=en",
    "-Dlog4j2.formatMsgNoLookups=true",
    resolved.mainClass,
    "--username", auth.username,
    "--version", resolved.forgeName,
    "--gameDir", instanceDir,
    "--assetsDir", join(installDir, "assets"),
    "--assetIndex", resolved.assetIndex,
    "--uuid", auth.uuid,
    "--accessToken", auth.accessToken,
    "--userType", "msa",
    "--versionType", "release",
    "--width", width, "--height", height,
    ...resolved.gameArgs,
  ];

  return { auth, cmd, forgeName: resolved.forgeName, instanceDir, lwjglVersion: resolved.lwjglVersion };
}

/** Redact the access token from a command array for display. */
export function redactCmd(cmd: string[]): string[] {
  return cmd.map((arg, i) =>
    cmd[i - 1] === "--accessToken" ? "<REDACTED>" : arg
  );
}
