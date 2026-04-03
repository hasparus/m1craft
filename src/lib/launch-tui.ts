import {
  BoxRenderable,
  type CliRenderer,
  createCliRenderer,
  TextRenderable,
} from "@opentui/core";
import { SpinnerRenderable } from "opentui-spinner";

import type { AuthCallbacks } from "./auth.js";
import type { LaunchCallbacks, LaunchStep } from "./launch.js";

const ACCENT = "#2563eb";

// -- Step row (matches setup.ts visual language) --

interface StepRow {
  icon: TextRenderable;
  row: BoxRenderable;
  spinner: SpinnerRenderable | null;
  text: TextRenderable;
}

function makeStepRow(
  renderer: CliRenderer,
  root: BoxRenderable,
  id: string,
  label: string,
): StepRow {
  const row = new BoxRenderable(renderer, {
    flexDirection: "row", gap: 1, height: 1, id: `${id}-row`, width: "100%",
  });
  const icon = new TextRenderable(renderer, { content: " · ", height: 1, id: `${id}-icon`, width: 3 });
  const text = new TextRenderable(renderer, { content: label, height: 1, id: `${id}-text` });
  row.add(icon);
  row.add(text);
  root.add(row);
  return { icon, row, spinner: null, text };
}

function setStepStatus(renderer: CliRenderer, step: StepRow, icon: string, label: string) {
  if (step.spinner) {
    step.spinner.stop();
    try { step.row.remove(step.spinner.id); } catch { /* already removed */ }
    step.spinner = null;
  }
  step.icon.content = ` ${icon} `;
  step.text.content = label;
  if (icon === "↓" || icon === "⚙") {
    step.spinner = new SpinnerRenderable(renderer, { color: ACCENT, name: "dots" });
    step.row.add(step.spinner);
  }
}

// -- Device code login box --

function showDeviceCodeBox(
  renderer: CliRenderer,
  root: BoxRenderable,
  userCode: string,
  verificationUri: string,
) {
  // Copy code to clipboard and open browser (same as auth.ts)
  Bun.spawn(["pbcopy"], { stdin: new Response(userCode).body });
  Bun.spawn(["open", `${verificationUri}?otc=${userCode}`]);

  const box = new BoxRenderable(renderer, {
    border: true,
    borderColor: ACCENT,
    borderStyle: "single",
    flexDirection: "column",
    gap: 0,
    height: 7,
    id: "login-box",
    paddingLeft: 2,
    paddingRight: 2,
    width: 47,
  });

  box.add(new TextRenderable(renderer, { content: "Microsoft Login", height: 1, id: "login-title" }));
  box.add(new TextRenderable(renderer, { content: "", height: 1, id: "login-spacer1" }));
  box.add(new TextRenderable(renderer, { content: `Your code: ${userCode}`, height: 1, id: "login-code" }));
  box.add(new TextRenderable(renderer, { content: "(copied to clipboard)", height: 1, id: "login-copied" }));
  box.add(new TextRenderable(renderer, { content: "", height: 1, id: "login-spacer2" }));
  box.add(new TextRenderable(renderer, { content: "Paste the code in the browser and sign in.", height: 1, id: "login-hint" }));

  root.add(box);
  return box;
}

// -- Main TUI --

export async function launchWithTui(opts: { dryRun?: boolean; instance?: string; }) {
  const renderer = await createCliRenderer({ exitOnCtrlC: true, useMouse: false });
  let alive = true;
  renderer.on("destroy", () => { alive = false; });

  const root = new BoxRenderable(renderer, {
    flexDirection: "column", gap: 0, height: "100%", id: "root", padding: 1, width: "100%",
  });
  root.add(new TextRenderable(renderer, { content: "m1craft", height: 2, id: "title" }));

  const steps: Record<LaunchStep, StepRow> = {
    auth: makeStepRow(renderer, root, "auth", "Auth"),
    classpath: makeStepRow(renderer, root, "classpath", "Classpath"),
    config: makeStepRow(renderer, root, "config", "Config"),
    java: makeStepRow(renderer, root, "java", "Java"),
    launch: makeStepRow(renderer, root, "launch", "Launch"),
  };

  const statusLine = new TextRenderable(renderer, { content: "", height: 1, id: "status" });
  root.add(statusLine);

  renderer.root.add(root);
  renderer.start();

  let loginBox: BoxRenderable | null = null;

  const authCallbacks: AuthCallbacks = {
    onDeviceCode(userCode, verificationUri) {
      if (!alive) return;
      loginBox = showDeviceCodeBox(renderer, root, userCode, verificationUri);
    },
    onStatus(status, detail) {
      if (!alive) return;
      const step = steps.auth;
      switch (status) {
        case "cached":
          setStepStatus(renderer, step, "✓", `Auth — ${detail}`);
          break;
        case "device-code":
          setStepStatus(renderer, step, "↓", "Auth — waiting for login...");
          break;
        case "done":
          setStepStatus(renderer, step, "✓", `Auth — ${detail}`);
          break;
        case "refreshing":
          setStepStatus(renderer, step, "↓", "Auth — refreshing token...");
          break;
        case "xbox":
          if (loginBox) {
            try { root.remove(loginBox.id); } catch { /* ok */ }
            loginBox = null;
          }
          setStepStatus(renderer, step, "↓", "Auth — exchanging tokens...");
          break;
      }
    },
  };

  const launchCallbacks: LaunchCallbacks = {
    auth: authCallbacks,
    onStep(step, detail) {
      if (!alive) return;
      switch (step) {
        case "auth":
          setStepStatus(renderer, steps.java, "✓", "Java");
          setStepStatus(renderer, steps.auth, "↓", "Auth...");
          break;
        case "classpath":
          // Auth step already got its final status from auth callbacks
          if (steps.auth.spinner) {
            setStepStatus(renderer, steps.auth, "✓", "Auth");
          }
          setStepStatus(renderer, steps.classpath, "↓", "Classpath — resolving...");
          break;
        case "config":
          setStepStatus(renderer, steps.config, "↓", "Config — loading...");
          break;
        case "java":
          setStepStatus(renderer, steps.config, "✓", "Config");
          setStepStatus(renderer, steps.java, "↓", "Java — finding JDK...");
          break;
        case "launch":
          setStepStatus(renderer, steps.classpath, "✓", "Classpath");
          setStepStatus(renderer, steps.launch, "✓", `Launching ${detail ?? "Minecraft"}...`);
          break;
      }
    },
  };

  try {
    const { launch } = await import("./launch.js");
    await launch(opts, launchCallbacks);
  } catch (error) {
    if (alive) {
      statusLine.content = `  Error: ${error instanceof Error ? error.message : error}`;
      await new Promise((r) => setTimeout(r, 3000));
    }
    renderer.destroy();
    await new Promise((r) => setTimeout(r, 50));
    throw error;
  }

  // Brief display then auto-dismiss
  if (alive) await new Promise((r) => setTimeout(r, 1000));
  renderer.destroy();
  await new Promise((r) => setTimeout(r, 50));
}
