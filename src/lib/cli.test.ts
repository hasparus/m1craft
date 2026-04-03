import { describe, expect, mock, test } from "bun:test";

import { print, printError } from "./cli.js";

describe("cli output", () => {
  test("print writes to stdout", () => {
    const write = mock(() => true);
    const original = process.stdout.write;
    process.stdout.write = write as typeof process.stdout.write;
    try {
      print("hello");
      expect(write).toHaveBeenCalledWith("hello\n");
    } finally {
      process.stdout.write = original;
    }
  });

  test("printError writes to stderr", () => {
    const write = mock(() => true);
    const original = process.stderr.write;
    process.stderr.write = write as typeof process.stderr.write;
    try {
      printError("oops");
      expect(write).toHaveBeenCalledWith("oops\n");
    } finally {
      process.stderr.write = original;
    }
  });
});
