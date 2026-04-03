import { describe, expect, test } from "bun:test";
import { join } from "node:path";

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
    expect(stdout).toContain("mc-arm64");
    expect(stdout).toContain("Commands:");
    expect(stdout).toContain("launch");
    expect(stdout).toContain("auth");
    expect(stdout).toContain("config");
    expect(stdout).toContain("setup");
  });

  test("help command prints usage", async () => {
    const { exitCode, stdout } = await run("help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("mc-arm64");
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

  test("resolve prints JSON classpath", async () => {
    const { exitCode, stdout } = await run("resolve");
    expect(exitCode).toBe(0);
    const config = JSON.parse(stdout);
    expect(config.classpath).toBeArray();
    expect(config.mainClass).toBeString();
    expect(config.forgeName).toBeString();
    expect(config.mcVersion).toBeString();
  });

  // launch --dry-run can't be tested in piped context because ensureSetup
  // opens an opentui TUI that blocks on non-interactive stdin.
  // Test the resolve command instead, which exercises the same classpath logic.
});
