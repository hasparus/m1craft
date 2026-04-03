import { isTaggedError } from "errore";
import { parseArgs } from "node:util";



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

async function ensureSetup() {
  const { loadJavaVersion } = await import("./lib/config.js");
  const javaVersion = await loadJavaVersion();

  const { checkSetup, runSetup } = await import("./lib/setup.js");
  const status = await checkSetup(javaVersion);
  if (status.javaFound && status.nativesFound && status.jarsFound) return;
  await runSetup(javaVersion);
}

try {
  switch (command) {
    case "auth": {
      const { authCommand } = await import("./lib/auth.js");
      await authCommand({ check: values.check });
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
      await ensureSetup();

      if (!values.instance) {
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

      if (values["dry-run"]) {
        const { launch } = await import("./lib/launch.js");
        await launch({ dryRun: true, instance: values.instance });
      } else {
        const { launchWithTui } = await import("./lib/launch-tui.js");
        await launchWithTui({ instance: values.instance });
      }
      break;
    }
    case "resolve": {
      const { resolveCommand } = await import("./lib/resolve.js");
      await resolveCommand({ instance: values.instance });
      break;
    }
    case "setup": {
      const { loadJavaVersion } = await import("./lib/config.js");
      const { runSetup } = await import("./lib/setup.js");
      await runSetup(await loadJavaVersion());
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
