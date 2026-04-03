import { afterAll, describe, expect, test } from "bun:test";

import type { UserConfig } from "./types.js";

import { loadConfig, loadJavaVersion, saveConfig } from "./config.js";

const TEST_PATH = "/tmp/m1craft-test-config.json";

afterAll(async () => {
  try { await Bun.file(TEST_PATH).unlink(); } catch { /* cleanup best-effort */ }
});

describe("config", () => {
  test("returns {} for missing file", async () => {
    expect(await loadConfig("/tmp/m1craft-nonexistent.json")).toEqual({});
  });

  test("handles corrupt JSON gracefully", async () => {
    await Bun.write(TEST_PATH, "not json {{{");
    expect(await loadConfig(TEST_PATH)).toEqual({});
  });

  test("save then load round-trips all fields", async () => {
    const original: UserConfig = {
      defaultInstance: "Test Pack",
      height: 1080,
      javaVersion: "21",
      width: 1920,
      xms: "512m",
      xmx: "4096m",
    };

    await saveConfig(original, TEST_PATH);
    const loaded = await loadConfig(TEST_PATH);

    expect(loaded).toEqual(original);
  });

  test("loadJavaVersion defaults to 17", async () => {
    expect(await loadJavaVersion("/tmp/m1craft-nonexistent-java.json")).toBe("17");
  });

  test("loadJavaVersion reads configured version", async () => {
    await Bun.write(TEST_PATH, JSON.stringify({ javaVersion: "21" }));
    expect(await loadJavaVersion(TEST_PATH)).toBe("21");
  });
});
