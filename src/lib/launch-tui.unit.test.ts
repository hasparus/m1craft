import { BoxRenderable, TextRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { describe, expect, test } from "bun:test";

import type { LaunchStep } from "./launch.js";

import { makeStepRow, setStepStatus, showDeviceCodeBox } from "./launch-tui.js";

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
    expect(frame).toContain("·");

    renderer.destroy();
  });

  test("setStepStatus updates icon and label, manages spinner", async () => {
    const { captureCharFrame, renderer, renderOnce } = await createTestRenderer({ height: 10, width: 60 });

    const root = new BoxRenderable(renderer, {
      flexDirection: "column", height: "100%", id: "root", width: "100%",
    });
    const step = makeStepRow(renderer, root, "test", "Test Step");
    renderer.root.add(root);

    setStepStatus(renderer, step, "✓", "Test Step — done");
    await renderOnce();
    expect(captureCharFrame()).toContain("✓");
    expect(captureCharFrame()).toContain("Test Step — done");

    setStepStatus(renderer, step, "↓", "Test Step — working...");
    await renderOnce();
    expect(captureCharFrame()).toContain("↓");
    expect(step.spinner).not.toBeNull();

    setStepStatus(renderer, step, "✓", "Test Step — complete");
    expect(step.spinner).toBeNull();

    renderer.destroy();
  });

  test("showDeviceCodeBox renders login prompt with user code", async () => {
    const { captureCharFrame, renderer, renderOnce } = await createTestRenderer({ height: 20, width: 60 });

    const root = new BoxRenderable(renderer, {
      flexDirection: "column", height: "100%", id: "root", width: "100%",
    });

    showDeviceCodeBox(renderer, root, "ABCD-1234");

    renderer.root.add(root);
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("Microsoft Login");
    expect(frame).toContain("ABCD-1234");
    expect(frame).toContain("copied to clipboard");

    renderer.destroy();
  });

  test("full launch step progression shows all checkmarks", async () => {
    const { captureCharFrame, renderer, renderOnce } = await createTestRenderer({ height: 20, width: 60 });

    const root = new BoxRenderable(renderer, {
      flexDirection: "column", gap: 0, height: "100%", id: "root", width: "100%",
    });

    const steps: Record<LaunchStep, ReturnType<typeof makeStepRow>> = {
      auth: makeStepRow(renderer, root, "auth", "Auth"),
      classpath: makeStepRow(renderer, root, "classpath", "Classpath"),
      config: makeStepRow(renderer, root, "config", "Config"),
      java: makeStepRow(renderer, root, "java", "Java"),
      launch: makeStepRow(renderer, root, "launch", "Launch"),
    };
    renderer.root.add(root);

    setStepStatus(renderer, steps.config, "✓", "Config");
    setStepStatus(renderer, steps.java, "✓", "Java");
    setStepStatus(renderer, steps.auth, "✓", "Auth — TestPlayer");
    setStepStatus(renderer, steps.classpath, "✓", "Classpath");
    setStepStatus(renderer, steps.launch, "✓", "Launching forge-1.20.1...");

    await renderOnce();
    const frame = captureCharFrame();

    const checkmarks = [...frame.matchAll(/✓/g)];
    expect(checkmarks.length).toBe(5);
    expect(frame).toContain("Launching forge-1.20.1...");

    renderer.destroy();
  });
});
