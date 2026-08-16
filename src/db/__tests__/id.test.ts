import { afterEach, describe, expect, it } from "vitest";
import { newId } from "../id";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const original = crypto.randomUUID;

afterEach(() => {
  Object.defineProperty(crypto, "randomUUID", {
    value: original,
    configurable: true,
    writable: true,
  });
});

// Simulates the insecure-context case: HCE is served over plain HTTP on a bare
// tailnet IP, where the browser leaves crypto.randomUUID undefined. This is the
// branch that matters — the secure-context one was never the broken path.
function withoutRandomUUID() {
  Object.defineProperty(crypto, "randomUUID", {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

describe("newId", () => {
  it("returns a v4 uuid when crypto.randomUUID is available", () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it("still returns a v4 uuid when crypto.randomUUID is missing", () => {
    withoutRandomUUID();
    expect(crypto.randomUUID).toBeUndefined();
    expect(newId()).toMatch(UUID_V4);
  });

  it("does not throw without crypto.randomUUID", () => {
    withoutRandomUUID();
    expect(() => newId()).not.toThrow();
  });

  it("generates distinct ids on the fallback path", () => {
    withoutRandomUUID();
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
  });
});
