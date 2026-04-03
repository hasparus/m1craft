import { join } from "node:path";

import { authenticate } from "./auth.js";
import { loadConfig } from "./config.js";
import { LaunchError } from "./errors.js";
import { findZuluJavaBin } from "./java.js";
import { CF_BASE, DEFAULT_INSTANCE, INSTALL, LWJGL_VERSION, NATIVES_DIR } from "./paths.js";
import { resolveClasspath } from "./resolve.js";

export async function launch(opts: { dryRun?: boolean; instance?: string; }) {
  const config = await loadConfig();

  const instanceDir = opts.instance
    ?? (config.defaultInstance
      ? join(CF_BASE, "Instances", config.defaultInstance)
      : DEFAULT_INSTANCE);

  const javaVersion = config.javaVersion ?? "17";
  const java = await findZuluJavaBin(javaVersion);
  if (!java) throw new LaunchError({ message: `Zulu ${javaVersion} ARM not found. Run 'mc-arm64 setup' first.` });

  const auth = await authenticate();
  console.error(`Auth: ${auth.username} (${auth.uuid.slice(0, 8)}...)`);

  const lwjglVersion = config.lwjglVersion ?? LWJGL_VERSION;
  const resolved = await resolveClasspath(instanceDir, INSTALL, lwjglVersion);
  console.error(`Launching ${resolved.forgeName}...`);

  const xmx = config.xmx ?? "8192m";
  const xms = config.xms ?? "256m";
  const width = String(config.width ?? 1024);
  const height = String(config.height ?? 768);

  const cmd = [
    java,
    "-XstartOnFirstThread", "-Xss1M",
    `-Dorg.lwjgl.librarypath=${NATIVES_DIR}`,
    `-Djava.library.path=${NATIVES_DIR}`,
    "-Dfml.earlyprogresswindow=false",
    "-Dminecraft.launcher.brand=mc-arm64",
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
    "--assetsDir", join(INSTALL, "assets"),
    "--assetIndex", resolved.assetIndex,
    "--uuid", auth.uuid,
    "--accessToken", auth.accessToken,
    "--userType", "msa",
    "--versionType", "release",
    "--width", width, "--height", height,
    ...resolved.gameArgs,
  ];

  if (opts.dryRun) {
    const redacted = cmd.map((arg, i) =>
      cmd[i - 1] === "--accessToken" ? "<REDACTED>" : arg
    );
    console.log(redacted.join(" \\\n  "));
    return;
  }

  // Spawn Java detached and exit — don't hog RAM while MC runs
  const proc = Bun.spawn(cmd, {
    cwd: instanceDir,
    stdio: ["inherit", "inherit", "inherit"],
  });
  proc.unref();
  process.exit(0);
}
