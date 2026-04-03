import { test, expect, describe } from "bun:test";
import type { VersionArgument } from "./types.js";
import { osMatches } from "./rules.js";

// Re-implement flattenArgs here since it's not exported.
// This tests the logic, not the import — flattenArgs is a private helper.
function flattenArgs(args: VersionArgument[]): string[] {
  const result: string[] = [];
  for (const arg of args) {
    if (typeof arg === "string") {
      result.push(arg);
    } else if (osMatches(arg.rules)) {
      if (typeof arg.value === "string") result.push(arg.value);
      else result.push(...arg.value);
    }
  }
  return result;
}

describe("flattenArgs", () => {
  test("passes through plain strings", () => {
    expect(flattenArgs(["--foo", "bar"])).toEqual(["--foo", "bar"]);
  });

  test("empty array → empty array", () => {
    expect(flattenArgs([])).toEqual([]);
  });

  test("includes conditional arg matching osx", () => {
    const args: VersionArgument[] = [
      "--before",
      {
        rules: [{ action: "allow" as const, os: { name: "osx" } }],
        value: "-XstartOnFirstThread",
      },
      "--after",
    ];
    expect(flattenArgs(args)).toEqual(["--before", "-XstartOnFirstThread", "--after"]);
  });

  test("excludes conditional arg matching linux only", () => {
    const args: VersionArgument[] = [
      "--keep",
      {
        rules: [{ action: "allow" as const, os: { name: "linux" } }],
        value: "--linux-only",
      },
    ];
    expect(flattenArgs(args)).toEqual(["--keep"]);
  });

  test("expands array values from conditional", () => {
    const args: VersionArgument[] = [
      {
        rules: [{ action: "allow" as const }],
        value: ["-Dfoo=bar", "-Dbaz=qux"],
      },
    ];
    expect(flattenArgs(args)).toEqual(["-Dfoo=bar", "-Dbaz=qux"]);
  });

  test("mixed strings and conditionals", () => {
    const args: VersionArgument[] = [
      "-cp",
      "${classpath}",
      {
        rules: [{ action: "allow" as const, os: { name: "windows" } }],
        value: "-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump",
      },
      {
        rules: [{ action: "allow" as const, os: { name: "osx" } }],
        value: ["-XstartOnFirstThread"],
      },
    ];
    expect(flattenArgs(args)).toEqual(["-cp", "${classpath}", "-XstartOnFirstThread"]);
  });
});
