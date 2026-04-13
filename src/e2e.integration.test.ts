import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { CF_BASE, getAuthCachePath } from "./lib/paths.js";

const MAIN = join(import.meta.dir, "main.ts");

async function run(...args: string[]) {
  const proc = Bun.spawn(["bun", MAIN, ...args], {
    env: { ...process.env, NO_COLOR: "1" },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stderr, stdout };
}

describe("e2e", () => {
  test("--help prints usage and exits 0", async () => {
    const { exitCode, stdout } = await run("--help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("m1craft");
    expect(stdout).toContain("Commands:");
    expect(stdout).toContain("launch");
    expect(stdout).toContain("auth");
    expect(stdout).toContain("config");
    expect(stdout).toContain("setup");
  });

  test("help command prints usage", async () => {
    const { exitCode, stdout } = await run("help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("m1craft");
  });

  test("unknown command exits 1", async () => {
    const { exitCode, stderr } = await run("nonexistent");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown command");
  });

  test("auth --check reports token status", async () => {
    const { exitCode, stdout } = await run("auth", "--check");
    expect(exitCode).toBe(0);
    // Either "Token valid" or "No cached auth" or "Token expired"
    expect(
      stdout.includes("Token valid") ||
      stdout.includes("No cached auth") ||
      stdout.includes("Token expired"),
    ).toBe(true);
  });

  const hasCurseForge = existsSync(join(CF_BASE, "Install"));
  test.skipIf(!hasCurseForge)("resolve prints JSON classpath", async () => {
    const { exitCode, stdout } = await run("resolve");
    expect(exitCode).toBe(0);
    const config = JSON.parse(stdout);
    expect(config.classpath).toBeArray();
    expect(config.mainClass).toBeString();
    expect(config.forgeName).toBeString();
    expect(config.mcVersion).toBeString();
  });

  const hasAuth = existsSync(getAuthCachePath());
  test.skipIf(!hasCurseForge || !hasAuth)("launch --dry-run prints JVM command", async () => {
    const { exitCode, stdout } = await run("launch", "--dry-run");
    expect(exitCode).toBe(0);

    // Should contain java binary path
    expect(stdout).toContain("bin/java");
    // Should contain key JVM flags
    expect(stdout).toContain("-XstartOnFirstThread");
    expect(stdout).toContain("-Dminecraft.launcher.brand=m1craft");
    // Classpath
    expect(stdout).toContain("-cp");
    // Game args
    expect(stdout).toContain("--username");
    expect(stdout).toContain("--gameDir");
    // Access token should be redacted. The value follows --accessToken
    // separated by " \\\n  " line continuation, so the gap may contain
    // whitespace and backslashes.
    expect(stdout).toMatch(/--accessToken[\s\\]+<REDACTED>/);
  });
});
