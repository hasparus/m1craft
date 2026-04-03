import { parseArgs } from "node:util";
import { isTaggedError } from "errore";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    "dry-run": { type: "boolean" },
    check: { type: "boolean" },
    instance: { type: "string" },
  },
});

const command = positionals[0];

function printHelp() {
  console.log(`mc-arm64 — Minecraft Forge on Apple Silicon

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

function formatError(err: unknown): string {
  if (isTaggedError(err)) {
    const lines = [err.message];

    // Walk the cause chain for context
    let cause = err.cause;
    while (cause instanceof Error) {
      if (isTaggedError(cause) && cause.message !== err.message) {
        lines.push(`  caused by: ${cause.message}`);
      }
      cause = cause.cause;
    }

    return lines.join("\n");
  }

  if (err instanceof Error) return err.message;
  return String(err);
}

async function ensureSetup() {
  const { checkSetup, runSetup } = await import("./lib/setup.js");
  const status = await checkSetup();
  if (status.javaFound && status.nativesFound && status.jarsFound) return;

  const missing: string[] = [];
  if (!status.javaFound) missing.push("Zulu JDK 17 ARM64");
  if (!status.jarsFound) missing.push("LWJGL 3.3.3 JARs");
  if (!status.nativesFound) missing.push("ARM64 native libraries");

  console.error("");
  console.error("  First-time setup — downloading:");
  for (const m of missing) console.error(`    - ${m}`);
  console.error("");

  await runSetup();
}

async function main() {
  // Auto-setup on any command except help/--help
  if (command !== "help" && !values.help) {
    await ensureSetup();
  }

  switch (command) {
    case "help":
      printHelp();
      break;
    case "launch":
    case undefined: {
      if (values.help) { printHelp(); break; }
      const { launch } = await import("./lib/launch.js");
      await launch({
        instance: values.instance,
        dryRun: values["dry-run"],
      });
      break;
    }
    case "auth": {
      const { authCommand } = await import("./lib/auth.js");
      await authCommand({ check: values.check });
      break;
    }
    case "resolve": {
      const { resolveCommand } = await import("./lib/resolve.js");
      await resolveCommand({ instance: values.instance });
      break;
    }
    case "config": {
      const { configTui } = await import("./lib/config-tui.js");
      await configTui();
      break;
    }
    case "setup": {
      const { runSetup } = await import("./lib/setup.js");
      await runSetup();
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n  Error: ${formatError(err)}\n`);
  process.exit(1);
});
