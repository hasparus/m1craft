import { test, expect, describe } from "bun:test";
import { findZuluDirs, findJavaBinary } from "./java.js";

describe("findZuluDirs", () => {
  test("finds installed Zulu 17 directories", async () => {
    const dirs = await findZuluDirs("17");
    // This machine has Zulu 17 installed (from setup.sh)
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs[0]).toMatch(/^zulu17\./);
    expect(dirs[0]).toContain("macosx_aarch64");
  });

  test("returns empty for non-existent version", async () => {
    const dirs = await findZuluDirs("99");
    expect(dirs).toEqual([]);
  });

  test("results are sorted", async () => {
    const dirs = await findZuluDirs("17");
    const sorted = [...dirs].sort();
    expect(dirs).toEqual(sorted);
  });
});

describe("findJavaBinary", () => {
  test("returns path for installed version", async () => {
    const path = await findJavaBinary("17");
    expect(path).not.toBeNull();
    expect(path!).toContain("bin/java");
  });

  test("returns null for missing version", async () => {
    const path = await findJavaBinary("99");
    expect(path).toBeNull();
  });
});
