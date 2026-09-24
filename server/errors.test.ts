import { describe, expect, it } from "vitest";
import { ExtractError } from "./errors.ts";

describe("ExtractError", () => {
  it("defaults to 400 and keeps a custom status", () => {
    expect(new ExtractError("nope").status).toBe(400);
    expect(new ExtractError("gone", 502).status).toBe(502);
    expect(new ExtractError("nope")).toBeInstanceOf(Error);
  });
});
