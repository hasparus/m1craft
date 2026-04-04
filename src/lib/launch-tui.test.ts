import { BoxRenderable, type RenderContext, TextRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { describe, expect, test } from "bun:test";
import { SpinnerRenderable } from "opentui-spinner";

import type { LaunchStep } from "./launch.js";

const ACCENT = "#2563eb";

interface StepRow {
  icon: TextRenderable;
  row: BoxRenderable;
  spinner: SpinnerRenderable | null;
  text: TextRenderable;
}

function makeStepRow(renderer: RenderContext, root: BoxRenderable, id: string, label: string): StepRow {
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

function setStepStatus(renderer: RenderContext, step: StepRow, stepIcon: string, label: string) {
  if (step.spinner) {
    step.spinner.stop();
    try { step.row.remove(step.spinner.id); } catch { /* already removed */ }
    step.spinner = null;
  }
  step.icon.content = ` ${stepIcon} `;
  step.text.content = label;
  if (stepIcon === "↓" || stepIcon === "⚙") {
    step.spinner = new SpinnerRenderable(renderer, { color: ACCENT, name: "dots" });
    step.row.add(step.spinner);
  }
}

describe("launch TUI", () => {
  test("renders all 5 step rows with pending icons", async () => {
    const { captureCharFrame, renderer, renderOnce } = await createTestRenderer({ height: 20, width: 60 });

    const root = new BoxRenderable(renderer, {
      flexDirection: "column", gap: 0, height: "100%", id: "root", padding: 1, width: "100%",
    });
    root.add(new TextRenderable(renderer, { content: "m1craft", height: 2, id: "title" }));

    const stepNames: LaunchStep[] = ["config", "java", "auth", "classpath", "launch"];
    for (const name of stepNames) {
      makeStepRow(renderer, root, name, name.charAt(0).toUpperCase() + name.slice(1));
    }

    renderer.root.add(root);
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("m1craft");
    expect(frame).toContain("Config");
    expect(frame).toContain("Java");
    expect(frame).toContain("Auth");
    expect(frame).toContain("Classpath");
    expect(frame).toContain("Launch");
    // All should show pending icon
    expect(frame).toContain("·");

    renderer.destroy();
  });

  test("setStepStatus updates icon and label", async () => {
    const { captureCharFrame, renderer, renderOnce } = await createTestRenderer({ height: 10, width: 60 });

    const root = new BoxRenderable(renderer, {
      flexDirection: "column", height: "100%", id: "root", width: "100%",
    });
    const step = makeStepRow(renderer, root, "test", "Test Step");
    renderer.root.add(root);

    // Mark as done
    setStepStatus(renderer, step, "✓", "Test Step — done");
    await renderOnce();
    let frame = captureCharFrame();
    expect(frame).toContain("✓");
    expect(frame).toContain("Test Step — done");

    // Mark as working (should add spinner)
    setStepStatus(renderer, step, "↓", "Test Step — working...");
    await renderOnce();
    frame = captureCharFrame();
    expect(frame).toContain("↓");
    expect(frame).toContain("Test Step — working...");
    expect(step.spinner).not.toBeNull();

    // Mark as done again (should remove spinner)
    setStepStatus(renderer, step, "✓", "Test Step — complete");
    expect(step.spinner).toBeNull();

    renderer.destroy();
  });

  test("device code login box renders with user code", async () => {
    const { captureCharFrame, renderer, renderOnce } = await createTestRenderer({ height: 20, width: 60 });

    const root = new BoxRenderable(renderer, {
      flexDirection: "column", height: "100%", id: "root", width: "100%",
    });

    // Build a login box inline (same structure as showDeviceCodeBox minus the Bun.spawn calls)
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
    box.add(new TextRenderable(renderer, { content: "Your code: ABCD-1234", height: 1, id: "login-code" }));
    box.add(new TextRenderable(renderer, { content: "(copied to clipboard)", height: 1, id: "login-copied" }));
    root.add(box);

    renderer.root.add(root);
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Microsoft Login");
    expect(frame).toContain("ABCD-1234");
    expect(frame).toContain("copied to clipboard");

    renderer.destroy();
  });

  test("step progression simulates a launch sequence", async () => {
    const { captureCharFrame, renderer, renderOnce } = await createTestRenderer({ height: 20, width: 60 });

    const root = new BoxRenderable(renderer, {
      flexDirection: "column", gap: 0, height: "100%", id: "root", width: "100%",
    });

    const steps = {
      auth: makeStepRow(renderer, root, "auth", "Auth"),
      classpath: makeStepRow(renderer, root, "classpath", "Classpath"),
      config: makeStepRow(renderer, root, "config", "Config"),
      java: makeStepRow(renderer, root, "java", "Java"),
      launch: makeStepRow(renderer, root, "launch", "Launch"),
    };
    renderer.root.add(root);

    // Simulate the launch progression
    setStepStatus(renderer, steps.config, "✓", "Config");
    setStepStatus(renderer, steps.java, "✓", "Java");
    setStepStatus(renderer, steps.auth, "✓", "Auth — TestPlayer");
    setStepStatus(renderer, steps.classpath, "✓", "Classpath");
    setStepStatus(renderer, steps.launch, "✓", "Launching forge-1.20.1...");

    await renderOnce();
    const frame = captureCharFrame();

    // All steps should show checkmark
    const checkmarks = [...frame.matchAll(/✓/g)];
    expect(checkmarks.length).toBe(5);
    expect(frame).toContain("Launching forge-1.20.1...");

    renderer.destroy();
  });
});
