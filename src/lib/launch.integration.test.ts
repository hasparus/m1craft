import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { type LaunchStep, prepareLaunch, redactCmd } from "./launch.js";
// Auth cache path is overridden via M1CRAFT_AUTH_CACHE_PATH env in beforeAll
import { installJava } from "./setup.js";

// -- Fixtures (same structure as resolve.test.ts) --

const FIXTURE = "/tmp/m1craft-launch-test";
const INSTANCE = join(FIXTURE, "instance");
const INSTALL = join(FIXTURE, "install");

// -- MSW auth mock --

const msw = setupServer(
  http.post("https://login.live.com/oauth20_connect.srf", () =>
    HttpResponse.json({ device_code: "dc", interval: 0, user_code: "TEST", verification_uri: "https://x.com" }),
  ),
  http.post("https://login.live.com/oauth20_token.srf", () =>
    HttpResponse.json({ access_token: "ms-tok", refresh_token: "ms-ref" }),
  ),
  http.post("https://user.auth.xboxlive.com/user/authenticate", () =>
    HttpResponse.json({ Token: "xbl-tok" }),
  ),
  http.post("https://xsts.auth.xboxlive.com/xsts/authorize", () =>
    HttpResponse.json({ DisplayClaims: { xui: [{ uhs: "uhs123" }] }, Token: "xsts-tok" }),
  ),
  http.post("https://api.minecraftservices.com/authentication/login_with_xbox", () =>
    HttpResponse.json({ access_token: "mc-tok", expires_in: 86_400 }),
  ),
  http.get("https://api.minecraftservices.com/minecraft/profile", () =>
    HttpResponse.json({ id: "aabbccdd", name: "TestPlayer" }),
  ),
);

const TEST_AUTH_CACHE = join(FIXTURE, "test-auth-cache.json");

beforeAll(async () => {
  msw.listen({ onUnhandledRequest: "bypass" });
  // Isolate auth cache so tests don't touch the real one
  process.env["M1CRAFT_AUTH_CACHE_PATH"] = TEST_AUTH_CACHE;

  // Ensure Java is installed
  await installJava("17");

  // Create fixture instance + version JSONs
  await mkdir(INSTANCE, { recursive: true });
  await mkdir(join(INSTALL, "versions/forge-test/"), { recursive: true });
  await mkdir(join(INSTALL, "versions/1.20.1/"), { recursive: true });
  await mkdir(join(INSTALL, "libraries/net/minecraftforge/forge/1.20.1/"), { recursive: true });
  await mkdir(join(INSTALL, "libraries/org/lwjgl/lwjgl/3.3.3/"), { recursive: true });

  await Bun.write(join(INSTANCE, "minecraftinstance.json"), JSON.stringify({
    baseModLoader: { forgeVersion: "47.2.0", name: "forge-test", type: 1 },
    gameVersion: "1.20.1",
  }));

  await Bun.write(join(INSTALL, "versions/forge-test/forge-test.json"), JSON.stringify({
    arguments: { game: ["--fml.forgeVersion", "47.2.0"], jvm: ["-Dfml=true"] },
    libraries: [{
      downloads: { artifact: { path: "net/minecraftforge/forge/1.20.1/forge-1.20.1.jar", sha1: "a", size: 1, url: "" } },
      name: "net.minecraftforge:forge:1.20.1",
    }],
    mainClass: "cpw.mods.bootstraplauncher.BootstrapLauncher",
  }));

  await Bun.write(join(INSTALL, "versions/1.20.1/1.20.1.json"), JSON.stringify({
    assetIndex: { id: "5" },
    assets: "5",
    libraries: [{
      downloads: { artifact: { path: "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1.jar", sha1: "b", size: 1, url: "" } },
      name: "org.lwjgl:lwjgl:3.3.1",
    }],
    mainClass: "net.minecraft.client.main.Main",
  }));

  await Bun.write(join(INSTALL, "versions/forge-test/forge-test.jar"), "");
  await Bun.write(join(INSTALL, "libraries/net/minecraftforge/forge/1.20.1/forge-1.20.1.jar"), "");
  await Bun.write(join(INSTALL, "libraries/org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar"), "");

  // Clear auth cache to force device code flow through msw
  try { await Bun.file(TEST_AUTH_CACHE).unlink(); } catch { /* ok */ }
}, 120_000);

beforeEach(async () => {
  try { await Bun.file(TEST_AUTH_CACHE).unlink(); } catch { /* ok */ }
});
afterEach(() => { msw.resetHandlers(); });
afterAll(async () => {
  msw.close();
  delete process.env["M1CRAFT_AUTH_CACHE_PATH"];
  await rm(FIXTURE, { force: true, recursive: true });
});

describe("prepareLaunch", () => {
  test("returns cmd array with java binary", async () => {
    const result = await prepareLaunch(
      { installDir: INSTALL, instance: INSTANCE },
      { auth: { onDeviceCode() { /* noop */ }, onStatus() { /* noop */ } } },
    );

    expect(result.cmd[0]).toContain("bin/java");
    expect(result.cmd).toContain("-XstartOnFirstThread");
    expect(result.cmd).toContain("-Dminecraft.launcher.brand=m1craft");
  });

  test("includes forge main class", async () => {
    const result = await prepareLaunch(
      { installDir: INSTALL, instance: INSTANCE },
      { auth: { onDeviceCode() { /* noop */ }, onStatus() { /* noop */ } } },
    );

    expect(result.cmd).toContain("cpw.mods.bootstraplauncher.BootstrapLauncher");
  });

  test("includes auth credentials in cmd", async () => {
    const result = await prepareLaunch(
      { installDir: INSTALL, instance: INSTANCE },
      { auth: { onDeviceCode() { /* noop */ }, onStatus() { /* noop */ } } },
    );

    expect(result.cmd).toContain("--username");
    expect(result.cmd).toContain("TestPlayer");
    expect(result.cmd).toContain("--accessToken");
    expect(result.auth.username).toBe("TestPlayer");
  });

  test("returns forgeName and instanceDir", async () => {
    const result = await prepareLaunch(
      { installDir: INSTALL, instance: INSTANCE },
      { auth: { onDeviceCode() { /* noop */ }, onStatus() { /* noop */ } } },
    );

    expect(result.forgeName).toBe("forge-test");
    expect(result.instanceDir).toBe(INSTANCE);
  });

  test("fires onStep callbacks in order", async () => {
    const steps: LaunchStep[] = [];

    await prepareLaunch(
      { installDir: INSTALL, instance: INSTANCE },
      {
        auth: { onDeviceCode() { /* noop */ }, onStatus() { /* noop */ } },
        onStep(step) { steps.push(step); },
      },
    );

    expect(steps).toEqual(["config", "java", "auth", "classpath", "launch"]);
  });

  test("redactCmd hides access token", async () => {
    const result = await prepareLaunch(
      { installDir: INSTALL, instance: INSTANCE },
      { auth: { onDeviceCode() { /* noop */ }, onStatus() { /* noop */ } } },
    );

    const redacted = redactCmd(result.cmd);
    const tokenIdx = redacted.indexOf("--accessToken");
    expect(redacted[tokenIdx + 1]).toBe("<REDACTED>");
    expect(redacted).not.toContain("mc-tok");
  });
});
