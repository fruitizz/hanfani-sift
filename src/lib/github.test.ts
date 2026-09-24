import { describe, expect, it } from "vitest";
import { GITHUB_API, GITHUB_OWNER, GITHUB_REPO, GITHUB_SSH, GITHUB_URL } from "./github.ts";

describe("github constants", () => {
  it("points at fruitizz/hanfani-sift", () => {
    expect(GITHUB_OWNER).toBe("fruitizz");
    expect(GITHUB_REPO).toBe("hanfani-sift");
    expect(GITHUB_URL).toBe("https://github.com/fruitizz/hanfani-sift");
    expect(GITHUB_SSH).toBe("git@github.com:fruitizz/hanfani-sift.git");
    expect(GITHUB_API).toBe("https://api.github.com/repos/fruitizz/hanfani-sift");
  });
});
