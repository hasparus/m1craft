import { createTestRenderer } from "@opentui/core/testing";
import { describe, expect, test } from "bun:test";

import type { UserConfig } from "./config.js";

import { mountConfigTui } from "./config-tui.js";

const baseConfig: UserConfig = {
  height: 768,
  javaVersion: "17",
  width: 1024,
  xms: "256m",
  xmx: "8192m",
};
const instanceNames = ["Modpack One", "Modpack Two"];

// Keep the post-save banner around so the auto-destroy timer doesn't fire
// mid-assertion. Tests destroy the renderer explicitly.
const NEVER = 1_000_000;

const tick = () => new Promise((r) => setTimeout(r, 0));

function makeOnSave() {
  const saved: UserConfig[] = [];
  return { onSave: async (c: UserConfig) => { saved.push(c); }, saved };
}

describe("config TUI", () => {
  test("renders selectors, save button, and shortcut hint", async () => {
    const { captureCharFrame, renderOnce, renderer } = await createTestRenderer({ height: 50, width: 80 });
    const { onSave } = makeOnSave();
    mountConfigTui(renderer, { config: baseConfig, instanceNames, onSave, saveBannerMs: NEVER });
    await renderOnce();

    const frame = captureCharFrame();
    expect(frame).toContain("m1craft config");
    expect(frame).toContain("Modpack One");
    expect(frame).toContain("Java 17");
    expect(frame).toContain("[ Save ]");
    expect(frame).toContain("Ctrl+S");
    expect(frame).toContain("Cmd+S");

    renderer.destroy();
  });

  test("Ctrl+S persists current config", async () => {
    const { mockInput, renderOnce, renderer } = await createTestRenderer({ height: 50, width: 80 });
    const { onSave, saved } = makeOnSave();
    mountConfigTui(renderer, { config: baseConfig, instanceNames, onSave, saveBannerMs: NEVER });
    await renderOnce();

    mockInput.pressKey("s", { ctrl: true });
    await tick();

    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual({
      defaultInstance: "Modpack One",
      height: 768,
      javaVersion: "17",
      width: 1024,
      xms: "256m",
      xmx: "8192m",
    });

    renderer.destroy();
  });

  test("Cmd+S (meta) also persists", async () => {
    const { mockInput, renderOnce, renderer } = await createTestRenderer({ height: 50, width: 80 });
    const { onSave, saved } = makeOnSave();
    mountConfigTui(renderer, { config: baseConfig, instanceNames, onSave, saveBannerMs: NEVER });
    await renderOnce();

    mockInput.pressKey("s", { meta: true });
    await tick();

    expect(saved).toHaveLength(1);

    renderer.destroy();
  });

  test("bare 's' does not save (avoids accidental save while focused on a Select)", async () => {
    const { mockInput, renderOnce, renderer } = await createTestRenderer({ height: 50, width: 80 });
    const { onSave, saved } = makeOnSave();
    mountConfigTui(renderer, { config: baseConfig, instanceNames, onSave, saveBannerMs: NEVER });
    await renderOnce();

    mockInput.pressKey("s");
    await tick();

    expect(saved).toHaveLength(0);

    renderer.destroy();
  });

  test("save is idempotent under repeated triggers", async () => {
    const { mockInput, renderOnce, renderer } = await createTestRenderer({ height: 50, width: 80 });
    const { onSave, saved } = makeOnSave();
    mountConfigTui(renderer, { config: baseConfig, instanceNames, onSave, saveBannerMs: NEVER });
    await renderOnce();

    mockInput.pressKey("s", { ctrl: true });
    mockInput.pressKey("s", { ctrl: true });
    mockInput.pressKey("s", { meta: true });
    await tick();

    expect(saved).toHaveLength(1);

    renderer.destroy();
  });
});
