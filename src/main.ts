import { isTaggedError } from "errore";
import { parseArgs } from "node:util";

import type { LaunchConfig } from "./lib/resolve.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    check: { type: "boolean" },
    "dry-run": { type: "boolean" },
    help: { short: "h", type: "boolean" },
    instance: { type: "string" },
  },
});

const command = positionals[0];

function printHelp() {
  console.log(`m1craft — Minecraft Forge on Apple Silicon

Commands:
  launch    Launch Minecraft (default if no command given)
  auth      Authenticate with Microsoft
  resolve   Show resolved classpath
  config    Configure defaults (TUI)
  setup     Download JDK + LWJGL natives

Options:
  --instance <path>   Override modpack instance directory
  --dry-run           Print JVM command without launching
  --check             (auth) Just check token status
  -h, --help          Show this help`);
}

function formatError(error: unknown): string {
  if (isTaggedError(error)) {
    const lines = [error.message];

    let { cause } = error;
    while (cause instanceof Error) {
      if (isTaggedError(cause) && cause.message !== error.message) {
        lines.push(`  caused by: ${cause.message}`);
      }
      cause = cause.cause;
    }

    return lines.join("\n");
  }

  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Resolve the instance classpath once so we know which LWJGL version setup
 * needs to install, and so prepareLaunch can reuse the result instead of
 * re-parsing the version JSONs. Throws on failure — callers decide whether
 * to surface (launch) or tolerate (setup, when pre-warming without a usable
 * instance).
 */
async function resolveForLaunch(instanceArg: string | undefined): Promise<LaunchConfig> {
  const { loadConfig } = await import("./lib/config.js");
  const { CF_BASE, DEFAULT_INSTANCE, INSTALL } = await import("./lib/paths.js");
  const { resolveClasspath } = await import("./lib/resolve.js");
  const { join } = await import("node:path");

  const config = await loadConfig();
  const instanceDir = instanceArg
    ?? (config.defaultInstance ? join(CF_BASE, "Instances", config.defaultInstance) : DEFAULT_INSTANCE);

  return resolveClasspath(instanceDir, INSTALL, config.lwjglVersion);
}

async function ensureSetup(lwjglVersion?: string) {
  const { loadJavaVersion } = await import("./lib/config.js");
  const javaVersion = await loadJavaVersion();

  const { checkSetup, runSetup } = await import("./lib/setup.js");
  const status = await checkSetup(lwjglVersion, javaVersion);
  if (status.javaFound && status.nativesFound && status.jarsFound) return;
  await runSetup(lwjglVersion, javaVersion);
}

try {
  switch (command) {
    case "auth": {
      if (values.check) {
        const { checkAuthStatus } = await import("./lib/auth.js");
        const status = await checkAuthStatus();
        if (status.status === "valid") console.log(`Token valid. ${status.username} (${status.uuid.slice(0, 8)}...) expires ${status.expires}`);
        else if (status.status === "expired") console.log("Token expired but refresh token available.");
        else console.log("No cached auth. Run 'm1craft auth' to log in.");
      } else {
        const { authenticate } = await import("./lib/auth.js");
        const result = await authenticate();
        console.log(`Authenticated as ${result.username} (${result.uuid})`);
      }
      break;
    }
    case "config": {
      const { configTui } = await import("./lib/config-tui.js");
      await configTui();
      break;
    }
    case "help":
      printHelp();
      break;
    case "launch":
    case undefined: {
      if (values.help) { printHelp(); break; }

      // Pick a default instance first if none is set, so we know which
      // LWJGL version to install. The setup TUI runs after this. Skip the
      // welcome flow when stdin isn't a TTY (CI, dry-run-from-script, etc) —
      // configTui would block forever waiting for keyboard input.
      if (!values.instance && process.stdin.isTTY) {
        const { loadConfig } = await import("./lib/config.js");
        const config = await loadConfig();
        if (!config.defaultInstance) {
          const { discoverInstances } = await import("./lib/config.js");
          const instances = await discoverInstances();
          if (instances.length > 0) {
            console.error("");
            console.error("  Welcome to m1craft! Let's pick your modpack first.");
            console.error("");
            const { configTui } = await import("./lib/config-tui.js");
            await configTui();
          }
        }
      }

      const resolved = await resolveForLaunch(values.instance);
      await ensureSetup(resolved.lwjglVersion);

      if (values["dry-run"]) {
        const { prepareLaunch, redactCmd } = await import("./lib/launch.js");
        const result = await prepareLaunch({ instance: values.instance, resolved });
        console.log(redactCmd(result.cmd).join(" \\\n  "));
      } else {
        const { launchWithTui } = await import("./lib/launch-tui.js");
        await launchWithTui({ instance: values.instance, resolved });
      }
      break;
    }
    case "resolve": {
      const { loadConfig } = await import("./lib/config.js");
      const { resolveClasspath } = await import("./lib/resolve.js");
      const { DEFAULT_INSTANCE, INSTALL } = await import("./lib/paths.js");
      const config = await loadConfig();
      const instanceDir = values.instance ?? DEFAULT_INSTANCE;
      const resolved = await resolveClasspath(instanceDir, INSTALL, config.lwjglVersion);
      console.log(JSON.stringify(resolved, null, 2));
      break;
    }
    case "setup": {
      // Always run the TUI so the user sees setup status (✓ already present
      // vs ↓ downloading) rather than getting silent no-op when everything
      // is already installed.
      const { loadJavaVersion } = await import("./lib/config.js");
      const { runSetup } = await import("./lib/setup.js");
      const javaVersion = await loadJavaVersion();

      // Pre-warming setup tolerates a missing/invalid instance: a user may be
      // installing m1craft before launching any modpack from CurseForge, so
      // we fall back to LWJGL_FALLBACK_VERSION when detection fails. Launch
      // surfaces the same errors strictly.
      let lwjglVersion: string | undefined;
      try {
        lwjglVersion = (await resolveForLaunch(values.instance)).lwjglVersion;
      } catch (err) {
        console.error(`  Note: could not detect LWJGL version (${formatError(err)}). Using fallback.`);
      }

      await runSetup(lwjglVersion, javaVersion);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
} catch (error) {
  console.error(`\n  Error: ${formatError(error)}\n`);
  process.exit(1);
}
