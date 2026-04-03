import { parseArgs } from "node:util";

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

async function main() {
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
    case "config":
      console.log("TODO: config TUI");
      break;
    case "setup":
      console.log("TODO: setup");
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
