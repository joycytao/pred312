import { describe, expect, it } from "vitest";

import { describeFetchFailure, isRetryableFetchStatus } from "./import-prepdog-fetch";

describe("import-prepdog fetch helpers", () => {
  it("treats upstream gateway errors as retryable", () => {
    expect(isRetryableFetchStatus(522)).toBe(true);
    expect(isRetryableFetchStatus(503)).toBe(true);
    expect(isRetryableFetchStatus(404)).toBe(false);
  });

  it("explains PrepDog upstream outages clearly", () => {
    expect(describeFetchFailure("https://www.prepdog.org/1st/1-COMMON.html", 522)).toContain("PrepDog upstream is unavailable");
    expect(describeFetchFailure("https://www.prepdog.org/1st/1-COMMON.html", 522)).toContain("522");
  });
});