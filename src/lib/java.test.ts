import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { findZuluDirs, JAVA_DIR } from "./java.js";

describe("findZuluDirs", () => {
  test("finds installed Zulu 17 directories", async () => {
    const dirs = await findZuluDirs("17");
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs[0]).toMatch(/^zulu17\./);
    expect(dirs[0]).toContain("macosx_aarch64");
  });

  test("returns empty for non-existent version", async () => {
    expect(await findZuluDirs("99")).toEqual([]);
  });

  test("results are sorted", async () => {
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
