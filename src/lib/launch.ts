import { readdirSync } from "node:fs";
import { join } from "node:path";
import { authenticate } from "./auth.js";
import { resolveClasspath } from "./resolve.js";
import { INSTALL, NATIVES_DIR, DEFAULT_INSTANCE } from "./paths.js";

function findJava(): string {
  const javaDir = join(process.env["HOME"]!, "Library/Java");
  const match = readdirSync(javaDir).find(
    (e) => e.startsWith("zulu17") && e.includes("macosx_aarch64")
  );
  if (!match) throw new Error("Zulu 17 ARM not found. Run setup.sh first.");
  return join(javaDir, match, "bin/java");
}

export async function launch(opts: { instance?: string; dryRun?: boolean }) {
  const instanceDir = opts.instance ?? DEFAULT_INSTANCE;
  const java = await findJava();
  const auth = await authenticate();

  console.error(`Auth: ${auth.username} (${auth.uuid.slice(0, 8)}...)`);

  const config = await resolveClasspath(instanceDir);

  console.error(`Launching ${config.forgeName}...`);

  const cmd = [
    java,
    "-XstartOnFirstThread", "-Xss1M",
    `-Dorg.lwjgl.librarypath=${NATIVES_DIR}`,
    `-Djava.library.path=${NATIVES_DIR}`,
    "-Dfml.earlyprogresswindow=false",
    "-Dminecraft.launcher.brand=mc-arm64",
    ...config.jvmArgs,
    "-cp", config.classpath.join(":"),
    "-p", config.modulePath.join(":"),
    "--add-modules", "ALL-MODULE-PATH",
    "--add-opens", "java.base/java.util.jar=cpw.mods.securejarhandler",
    "--add-opens", "java.base/java.lang.invoke=cpw.mods.securejarhandler",
    "--add-exports", "java.base/sun.security.util=cpw.mods.securejarhandler",
    "--add-exports", "jdk.naming.dns/com.sun.jndi.dns=java.naming",
    "-Xmx8192m", "-Xms256m",
    "-Dfml.ignorePatchDiscrepancies=true",
    "-Dfml.ignoreInvalidMinecraftCertificates=true",
    "-Duser.language=en",
    "-Dlog4j2.formatMsgNoLookups=true",
    config.mainClass,
    "--username", auth.username,
    "--version", config.forgeName,
    "--gameDir", instanceDir,
    "--assetsDir", join(INSTALL, "assets"),
    "--assetIndex", config.assetIndex,
    "--uuid", auth.uuid,
    "--accessToken", auth.accessToken,
    "--userType", "msa",
    "--versionType", "release",
    "--width", "1024", "--height", "768",
    ...config.gameArgs,
  ];

  if (opts.dryRun) {
    console.log(cmd.join(" \\\n  "));
    return;
  }

  const proc = Bun.spawn(cmd, {
    cwd: instanceDir,
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(await proc.exited);
}
