import { test, expect, describe } from "bun:test";
import { osMatches } from "./rules.js";

describe("osMatches", () => {
  test("no rules → include", () => {
    expect(osMatches(undefined)).toBe(true);
    expect(osMatches([])).toBe(false); // empty rules array, result stays false
  });

  test("unconditional allow", () => {
    expect(osMatches([{ action: "allow" }])).toBe(true);
  });

  test("unconditional disallow", () => {
    expect(osMatches([{ action: "disallow" }])).toBe(false);
  });

  test("allow on osx only", () => {
    expect(osMatches([{ action: "allow", os: { name: "osx" } }])).toBe(true);
  });

  test("allow on linux only → excluded on macOS", () => {
    expect(osMatches([{ action: "allow", os: { name: "linux" } }])).toBe(false);
  });

  test("allow on windows only → excluded on macOS", () => {
    expect(osMatches([{ action: "allow", os: { name: "windows" } }])).toBe(false);
  });

  test("allow everywhere, disallow on linux → included on macOS", () => {
    expect(
      osMatches([
        { action: "allow" },
        { action: "disallow", os: { name: "linux" } },
      ]),
    ).toBe(true);
  });

  test("allow everywhere, disallow on osx → excluded on macOS", () => {
    expect(
      osMatches([
        { action: "allow" },
        { action: "disallow", os: { name: "osx" } },
      ]),
    ).toBe(false);
  });

  // Arch-specific rules
  test("allow on osx x86_64 only → excluded on arm64", () => {
    expect(
      osMatches([{ action: "allow", os: { name: "osx", arch: "x86_64" } }]),
    ).toBe(false);
  });

  test("allow on osx arm64 → included", () => {
    expect(
      osMatches([{ action: "allow", os: { name: "osx", arch: "arm64" } }]),
    ).toBe(true);
  });

  test("allow on osx aarch64 → included (alias)", () => {
    expect(
      osMatches([{ action: "allow", os: { name: "osx", arch: "aarch64" } }]),
    ).toBe(true);
  });

  test("disallow x86 on osx, allow everything else", () => {
    expect(
      osMatches([
        { action: "allow" },
        { action: "disallow", os: { name: "osx", arch: "x86" } },
      ]),
    ).toBe(true); // x86 rule doesn't match arm64, so allow stands
  });

  test("last matching rule wins", () => {
    expect(
      osMatches([
        { action: "disallow", os: { name: "osx" } },
        { action: "allow", os: { name: "osx" } },
      ]),
    ).toBe(true);

    expect(
      osMatches([
        { action: "allow", os: { name: "osx" } },
        { action: "disallow", os: { name: "osx" } },
      ]),
    ).toBe(false);
  });
});
