import { homedir } from "node:os";
import { join } from "node:path";
import { authenticate } from "./auth.js";
import { resolveClasspath } from "./resolve.js";
import { loadConfig } from "./config.js";
import { CF_BASE, INSTALL, NATIVES_DIR, DEFAULT_INSTANCE, LWJGL_VERSION } from "./paths.js";
import { LaunchError } from "./errors.js";

async function findJava(): Promise<string> {
  const javaDir = join(homedir(), "Library/Java");
  let entries: string[];
  try {
    entries = await Array.fromAsync(new Bun.Glob("zulu17.*-macosx_aarch64").scan(javaDir));
  } catch {
    throw new LaunchError({ message: "~/Library/Java not found. Run setup.sh first." });
  }
  entries.sort();
  const match = entries.at(-1); // latest version
  if (!match) throw new LaunchError({ message: "Zulu 17 ARM not found. Run setup.sh first." });
  return join(javaDir, match, "bin/java");
}

export async function launch(opts: { instance?: string; dryRun?: boolean }) {
  const config = await loadConfig();

  const instanceDir = opts.instance
    ?? (config.defaultInstance
      ? join(CF_BASE, "Instances", config.defaultInstance)
      : DEFAULT_INSTANCE);
  const java = await findJava();
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

  const proc = Bun.spawn(cmd, {
    cwd: instanceDir,
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(await proc.exited);
}
