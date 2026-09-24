import { describe, expect, it } from "vitest";
import { bytesToBase64, fnv1aBytes } from "./api.ts";

describe("fnv1aBytes", () => {
  it("is stable for the same bytes and changes when content changes", () => {
    const a = new TextEncoder().encode("hello").buffer;
    const b = new TextEncoder().encode("hello!").buffer;
    expect(fnv1aBytes(a)).toBe(fnv1aBytes(a.slice(0)));
    expect(fnv1aBytes(a)).not.toBe(fnv1aBytes(b));
  });
});

describe("bytesToBase64", () => {
  it("round-trips ascii bytes", () => {
    const buf = new TextEncoder().encode("sift").buffer;
    expect(bytesToBase64(buf)).toBe(btoa("sift"));
  });
});
