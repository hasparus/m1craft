import { describe, expect, test } from "bun:test";

import { findZuluDirs, findZuluJavaBin, JAVA_DIR } from "./java.js";
import { checkSetup, installJava } from "./setup.js";

describe("setup", () => {
  test("installJava downloads and installs Zulu 17", async () => {
    const javaBin = await installJava("17");
    expect(javaBin).toContain("bin/java");
    expect(await Bun.file(javaBin).exists()).toBe(true);
  }, 120_000); // 2 min timeout for download

  test("findZuluDirs finds installed JDK after install", async () => {
    const dirs = await findZuluDirs("17");
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs[0]).toMatch(/^zulu17\./);
  });

  test("findZuluJavaBin returns a valid path", async () => {
    const bin = await findZuluJavaBin("17");
    expect(bin).not.toBeNull();
    expect(bin!).toContain("bin/java");
  });

  test("checkSetup reports javaFound=true after install", async () => {
    const status = await checkSetup(undefined, "17");
    expect(status.javaFound).toBe(true);
  });

  test("installJava is idempotent (skips if already installed)", async () => {
    const start = performance.now();
    const javaBin = await installJava("17");
    const elapsed = performance.now() - start;
    expect(javaBin).toContain("bin/java");
    expect(elapsed).toBeLessThan(1000);
  });

  test("JAVA_DIR points to ~/Library/Java", () => {
    expect(JAVA_DIR).toContain("Library/Java");
  });
});
