import { describe, expect, it } from "vitest";
import { isWithin, parentDirectory, relativeToRoot } from "./workspace";

describe("recent path helpers", () => {
  it("resolves parent directories across unix and windows paths", () => {
    expect(parentDirectory("/home/user/request.json")).toBe("/home/user");
    expect(parentDirectory("/request.json")).toBe("/");
    expect(parentDirectory("/home/user/work/")).toBe("/home/user");
    expect(parentDirectory("C:\\work\\request.json")).toBe("C:\\work");
    expect(parentDirectory("C:\\request.json")).toBe("C:\\");
  });

  it("detects paths inside a workspace", () => {
    expect(isWithin("/home/user", "/home/user/a.json")).toBe(true);
    expect(isWithin("/home/user", "/home/user2/a.json")).toBe(false);
    expect(isWithin("/", "/a.json")).toBe(true);
    expect(isWithin("C:\\work", "C:\\work\\a.json")).toBe(true);
  });

  it("computes workspace-relative paths", () => {
    expect(relativeToRoot("/home/user", "/home/user/sub/a.json")).toBe("sub/a.json");
    expect(relativeToRoot("/", "/a.json")).toBe("a.json");
    expect(relativeToRoot("C:\\work", "C:\\work\\a.json")).toBe("a.json");
  });
});
