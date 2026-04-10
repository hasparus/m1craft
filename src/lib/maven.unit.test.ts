import { describe, expect, test } from "bun:test";

import { parseMaven } from "./maven.js";

describe("parseMaven", () => {
  test("parses standard group:artifact:version", () => {
    const c = parseMaven("org.lwjgl:lwjgl:3.3.3");
    expect(c.group).toBe("org.lwjgl");
    expect(c.artifact).toBe("lwjgl");
    expect(c.version).toBe("3.3.3");
    expect(c.classifier).toBeUndefined();
  });

  test("parses coordinate with classifier", () => {
    const c = parseMaven("net.minecraftforge:forge:1.18.2-40.3.0:client");
    expect(c.group).toBe("net.minecraftforge");
    expect(c.artifact).toBe("forge");
    expect(c.version).toBe("1.18.2-40.3.0");
    expect(c.classifier).toBe("client");
  });

  test("throws on malformed coordinate with fewer than 3 parts", () => {
    expect(() => parseMaven("just:two")).toThrow("Invalid Maven coordinate");
    expect(() => parseMaven("single")).toThrow("Invalid Maven coordinate");
    expect(() => parseMaven("")).toThrow("Invalid Maven coordinate");
  });

  test("handles deeply nested group", () => {
    const c = parseMaven("com.electronwill.night-config:core:3.6.4");
    expect(c.group).toBe("com.electronwill.night-config");
    expect(c.artifact).toBe("core");
    expect(c.version).toBe("3.6.4");
  });
});
