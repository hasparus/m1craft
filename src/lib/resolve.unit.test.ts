import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { compareLwjglVersion, parseLwjglVersion, resolveClasspath } from "./resolve.js";

const FIXTURE = "/tmp/m1craft-resolve-test";
const INSTANCE = join(FIXTURE, "instance");
const INSTALL = join(FIXTURE, "install");

beforeAll(async () => {
  await mkdir(INSTANCE, { recursive: true });
  await mkdir(join(INSTALL, "versions/forge-1.20.1/"), { recursive: true });
  await mkdir(join(INSTALL, "versions/1.20.1/"), { recursive: true });
  await mkdir(join(INSTALL, "libraries/net/minecraftforge/forge/1.20.1/"), { recursive: true });
  await mkdir(join(INSTALL, "libraries/org/lwjgl/lwjgl/3.3.3/"), { recursive: true });

  // Minimal CurseForge instance
  await Bun.write(
    join(INSTANCE, "minecraftinstance.json"),
    JSON.stringify({
      baseModLoader: { forgeVersion: "47.2.0", name: "forge-1.20.1", type: 1 },
      gameVersion: "1.20.1",
    }),
  );

  // Minimal Forge version JSON
  await Bun.write(
    join(INSTALL, "versions/forge-1.20.1/forge-1.20.1.json"),
    JSON.stringify({
      arguments: {
        game: ["--fml.forgeVersion", "47.2.0"],
        jvm: ["-Dfml.forg=true"],
      },
      libraries: [
        {
          downloads: { artifact: { path: "net/minecraftforge/forge/1.20.1/forge-1.20.1.jar", sha1: "abc", size: 100, url: "" } },
          name: "net.minecraftforge:forge:1.20.1",
        },
      ],
      mainClass: "cpw.mods.bootstraplauncher.BootstrapLauncher",
    }),
  );

  // Minimal base MC version JSON
  await Bun.write(
    join(INSTALL, "versions/1.20.1/1.20.1.json"),
    JSON.stringify({
      assetIndex: { id: "5" },
      assets: "5",
      libraries: [
        {
          downloads: { artifact: { path: "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar", sha1: "def", size: 200, url: "" } },
          name: "org.lwjgl:lwjgl:3.3.1",
        },
      ],
      mainClass: "net.minecraft.client.main.Main",
    }),
  );

  // Create dummy jars so file-exists checks pass
  await Bun.write(join(INSTALL, "versions/forge-1.20.1/forge-1.20.1.jar"), "");
  await Bun.write(join(INSTALL, "libraries/net/minecraftforge/forge/1.20.1/forge-1.20.1.jar"), "");
  await Bun.write(join(INSTALL, "libraries/org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar"), "");
});

afterAll(async () => {
  await rm(FIXTURE, { force: true, recursive: true });
});

describe("resolveClasspath", () => {
  test("resolves forge name and MC version from instance", async () => {
    const result = await resolveClasspath(INSTANCE, INSTALL, "3.3.3");
    expect(result.forgeName).toBe("forge-1.20.1");
    expect(result.mcVersion).toBe("1.20.1");
  });

  test("uses forge mainClass over base", async () => {
    const result = await resolveClasspath(INSTANCE, INSTALL, "3.3.3");
    expect(result.mainClass).toBe("cpw.mods.bootstraplauncher.BootstrapLauncher");
  });

  test("includes forge libraries in classpath", async () => {
    const result = await resolveClasspath(INSTANCE, INSTALL, "3.3.3");
    const forgeJar = result.classpath.find((p) => p.includes("minecraftforge"));
    expect(forgeJar).toBeDefined();
  });

  test("overrides lwjgl version to match provided version", async () => {
    const result = await resolveClasspath(INSTANCE, INSTALL, "3.3.3");
    const lwjglJar = result.classpath.find((p) => p.includes("lwjgl"));
    expect(lwjglJar).toContain("3.3.3");
    expect(lwjglJar).not.toContain("3.3.1");
  });

  test("includes game jar in classpath", async () => {
    const result = await resolveClasspath(INSTANCE, INSTALL, "3.3.3");
    const gameJar = result.classpath.find((p) => p.endsWith("forge-1.20.1.jar") && p.includes("versions"));
    expect(gameJar).toBeDefined();
  });

  test("extracts game args from forge manifest", async () => {
    const result = await resolveClasspath(INSTANCE, INSTALL, "3.3.3");
    expect(result.gameArgs).toContain("--fml.forgeVersion");
    expect(result.gameArgs).toContain("47.2.0");
  });

  test("extracts JVM args from forge manifest", async () => {
    const result = await resolveClasspath(INSTANCE, INSTALL, "3.3.3");
    expect(result.jvmArgs).toContain("-Dfml.forg=true");
  });

  test("resolves asset index", async () => {
    const result = await resolveClasspath(INSTANCE, INSTALL, "3.3.3");
    expect(result.assetIndex).toBe("5");
  });

  test("deduplicates classpath entries", async () => {
    const result = await resolveClasspath(INSTANCE, INSTALL, "3.3.3");
    const unique = new Set(result.classpath);
    expect(result.classpath.length).toBe(unique.size);
  });

  test("rejects invalid instance JSON", async () => {
    const badInstance = join(FIXTURE, "bad-instance");
    await mkdir(badInstance, { recursive: true });
    await Bun.write(join(badInstance, "minecraftinstance.json"), "{}");
    expect(resolveClasspath(badInstance, INSTALL, "3.3.3")).rejects.toThrow("Invalid CurseForge instance");
  });

  test("rejects malformed lwjglVersion override", async () => {
    expect(resolveClasspath(INSTANCE, INSTALL, "3.3")).rejects.toThrow("Invalid lwjglVersion");
    expect(resolveClasspath(INSTANCE, INSTALL, "not-a-version")).rejects.toThrow("Invalid lwjglVersion");
  });

  test("accepts lwjglVersion override with suffix", async () => {
    await mkdir(join(INSTALL, "libraries/org/lwjgl/lwjgl/3.3.3-SNAPSHOT/"), { recursive: true });
    await Bun.write(join(INSTALL, "libraries/org/lwjgl/lwjgl/3.3.3-SNAPSHOT/lwjgl-3.3.3-SNAPSHOT.jar"), "");
    const result = await resolveClasspath(INSTANCE, INSTALL, "3.3.3-SNAPSHOT");
    expect(result.lwjglVersion).toBe("3.3.3-SNAPSHOT");
  });
});

describe("parseLwjglVersion", () => {
  test("strict x.y.z", () => {
    expect(parseLwjglVersion("3.3.3")).toEqual({ numeric: [3, 3, 3], suffix: "" });
  });

  test("letter-suffixed alpha", () => {
    expect(parseLwjglVersion("3.0.0a")).toEqual({ numeric: [3, 0, 0], suffix: "a" });
  });

  test("hyphenated pre-release", () => {
    expect(parseLwjglVersion("3.3.3-SNAPSHOT")).toEqual({ numeric: [3, 3, 3], suffix: "-SNAPSHOT" });
  });

  test("permissive on non-strict shapes (parser is comparison key, not validator)", () => {
    expect(parseLwjglVersion("3.3")).toEqual({ numeric: [3, 3], suffix: "" });
    expect(parseLwjglVersion("garbage")).toEqual({ numeric: [0], suffix: "garbage" });
  });
});

describe("compareLwjglVersion", () => {
  test("strict x.y.z ordering", () => {
    expect(compareLwjglVersion("3.3.1", "3.3.3")).toBeLessThan(0);
    expect(compareLwjglVersion("3.3.3", "3.3.1")).toBeGreaterThan(0);
    expect(compareLwjglVersion("3.3.3", "3.3.3")).toBe(0);
    expect(compareLwjglVersion("3.2.3", "3.3.0")).toBeLessThan(0);
  });

  test("LWJGL actual release order: 3.0.0a < 3.0.0b < 3.0.0", () => {
    expect(compareLwjglVersion("3.0.0a", "3.0.0b")).toBeLessThan(0);
    expect(compareLwjglVersion("3.0.0b", "3.0.0")).toBeLessThan(0);
    expect(compareLwjglVersion("3.0.0a", "3.0.0")).toBeLessThan(0);
  });

  test("semver: stable > pre-release", () => {
    expect(compareLwjglVersion("3.3.3", "3.3.3-SNAPSHOT")).toBeGreaterThan(0);
    expect(compareLwjglVersion("3.3.3-SNAPSHOT", "3.3.3")).toBeLessThan(0);
  });

  test("threshold check 3.0.0-variants < 3.3.0", () => {
    expect(compareLwjglVersion("3.0.0a", "3.3.0")).toBeLessThan(0);
    expect(compareLwjglVersion("3.0.0b", "3.3.0")).toBeLessThan(0);
    expect(compareLwjglVersion("3.0.0", "3.3.0")).toBeLessThan(0);
  });

  test("natural-sort suffix: rc10 > rc2, not lexical", () => {
    expect(compareLwjglVersion("3.3.3-rc10", "3.3.3-rc2")).toBeGreaterThan(0);
    expect(compareLwjglVersion("3.3.3-beta.10", "3.3.3-beta.2")).toBeGreaterThan(0);
  });

  test("natural-sort suffix: alpha < beta", () => {
    expect(compareLwjglVersion("3.3.3-alpha", "3.3.3-beta")).toBeLessThan(0);
    expect(compareLwjglVersion("3.3.3-alpha.1", "3.3.3-beta.1")).toBeLessThan(0);
  });
});
