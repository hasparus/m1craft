import { describe, expect, test } from "bun:test";
import { isError, isTaggedError } from "errore";

import { AuthError, HttpError, LaunchError, ValidationError, XboxError } from "./errors.js";

describe("tagged errors", () => {
  test("HttpError has interpolated message and properties", () => {
    const err = new HttpError({ method: "POST", status: "404", url: "https://example.com" });
    expect(err.message).toBe("POST https://example.com returned 404");
    expect(err._tag).toBe("HttpError");
    expect(isError(err)).toBe(true);
    expect(isTaggedError(err)).toBe(true);
  });

  test("AuthError wraps cause chain", () => {
    const cause = new HttpError({ method: "GET", status: "500", url: "https://api.example.com" });
    const err = new AuthError({ cause, message: "Token refresh failed" });
    expect(err.message).toBe("Token refresh failed");
    expect(err.cause).toBe(cause);
    expect(err._tag).toBe("AuthError");
  });

  test("XboxError includes reason", () => {
    const err = new XboxError({ reason: "no Xbox account" });
    expect(err.message).toContain("no Xbox account");
    expect(err._tag).toBe("XboxError");
  });

  test("LaunchError works", () => {
    const err = new LaunchError({ message: "Java not found" });
    expect(err.message).toBe("Java not found");
    expect(err instanceof Error).toBe(true);
  });

  test("ValidationError includes source", () => {
    const err = new ValidationError({ source: "XSTS", summary: "missing Token field" });
    expect(err.message).toContain("XSTS");
    expect(err.message).toContain("missing Token field");
  });

  test("isError narrows tagged errors from unions", () => {
    const result: AuthError | { ok: true } = new AuthError({ message: "fail" });
    if (isError(result)) {
      expect(result._tag).toBe("AuthError");
    } else {
      throw new Error("should have been an error");
    }
  });
});
