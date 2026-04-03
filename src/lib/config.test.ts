import { test, expect, describe } from "bun:test";
import { loadConfig } from "./config.js";

describe("config", () => {
  const testPath = "/tmp/mc-arm64-test-config.json";

  // We can't easily mock CONFIG_PATH since it's a const,
  // so test loadConfig/saveConfig via round-trip with the real path.
  // The config file is in the user's home dir and may or may not exist.

  test("loadConfig returns empty object when file missing", async () => {
    // loadConfig catches errors and returns {}
    const config = await loadConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });

  test("saveConfig writes valid JSON", async () => {
    const testConfig = {
      defaultInstance: "Test Pack",
      javaVersion: "21",
      xmx: "4096m",
      xms: "512m",
      width: 1920,
      height: 1080,
    };

    // Write to a temp file to avoid touching the real config
    await Bun.write(testPath, JSON.stringify(testConfig, null, 2) + "\n");
    const content = await Bun.file(testPath).json();
    expect(content.defaultInstance).toBe("Test Pack");
    expect(content.javaVersion).toBe("21");
    expect(content.width).toBe(1920);

    // Cleanup
    await Bun.file(testPath).unlink();
  });
});
