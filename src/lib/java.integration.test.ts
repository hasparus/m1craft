import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { findZuluDirs, findZuluJavaBin, JAVA_DIR } from "./java.js";
import { installJava } from "./setup.js";

describe("findZuluDirs", () => {
  // Ensure Java is installed before testing (idempotent if already present)
  test("install Zulu 17 (idempotent)", async () => {
    const javaBin = await installJava("17");
    expect(javaBin).toContain("bin/java");
  }, 120_000);

  test("finds installed Zulu 17 directories", async () => {
    const dirs = await findZuluDirs("17");
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs[0]).toMatch(/^zulu17\./);
    expect(dirs[0]).toContain("macosx_aarch64");
  });

  test("returns empty for non-existent version", async () => {
    expect(await findZuluDirs("99")).toEqual([]);
  });

  test("results are sorted ascending", async () => {
    const dirs = await findZuluDirs("17");
    expect(dirs).toEqual([...dirs].sort((a, b) => a.localeCompare(b)));
  });

  test("latest dir has a valid java binary", async () => {
    const dirs = await findZuluDirs("17");
    const latest = dirs.at(-1)!;
    const javaBin = join(JAVA_DIR, latest, "bin/java");
    expect(await Bun.file(javaBin).exists()).toBe(true);
  });
});

describe("findZuluJavaBin", () => {
  test("returns path for installed version", async () => {
    const bin = await findZuluJavaBin("17");
    expect(bin).not.toBeNull();
    expect(bin!).toContain("bin/java");
    expect(bin!).toContain(JAVA_DIR);
  });

  test("returns null for non-existent version", async () => {
    expect(await findZuluJavaBin("99")).toBeNull();
  });
});
