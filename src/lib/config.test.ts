import { test, expect, describe, afterAll } from "bun:test";
import { loadConfig, saveConfig } from "./config.js";
import type { UserConfig } from "./types.js";

const TEST_PATH = "/tmp/mc-arm64-test-config.json";

afterAll(async () => {
  try { await Bun.file(TEST_PATH).unlink(); } catch {}
});

describe("config", () => {
  test("returns {} for missing file", async () => {
    expect(await loadConfig("/tmp/mc-arm64-nonexistent.json")).toEqual({});
  });

  test("handles corrupt JSON gracefully", async () => {
    await Bun.write(TEST_PATH, "not json {{{");
    expect(await loadConfig(TEST_PATH)).toEqual({});
  });

  test("save then load round-trips all fields", async () => {
    const original: UserConfig = {
      defaultInstance: "Test Pack",
      javaVersion: "21",
      xmx: "4096m",
      xms: "512m",
      width: 1920,
      height: 1080,
    };

    await saveConfig(original, TEST_PATH);
    const loaded = await loadConfig(TEST_PATH);

    expect(loaded).toEqual(original);
  });
});
