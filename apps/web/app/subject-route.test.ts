import { describe, expect, it } from "vitest";

import { getSubjectForPathname, getSubjectPath } from "./subject-route";

describe("subject-route", () => {
  it("maps subjects to stable app routes", () => {
    expect(getSubjectPath("math")).toBe("/math");
    expect(getSubjectPath("ela")).toBe("/ela");
  });

  it("derives the active subject from the pathname", () => {
    expect(getSubjectForPathname("/")).toBeNull();
    expect(getSubjectForPathname("/math")).toBe("math");
    expect(getSubjectForPathname("/ela")).toBe("ela");
    expect(getSubjectForPathname("/chinese-500")).toBeNull();
  });
});
