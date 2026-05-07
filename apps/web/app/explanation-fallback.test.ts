import { describe, expect, it } from "vitest";

import { buildFallbackExplanation, shouldUseLocalExplanationFallback } from "./explanation-fallback";

describe("explanation fallback", () => {
  it("uses local fallback when static Firebase hosting mode is enabled", () => {
    expect(shouldUseLocalExplanationFallback("1")).toBe(true);
    expect(shouldUseLocalExplanationFallback("true")).toBe(true);
    expect(shouldUseLocalExplanationFallback(undefined)).toBe(false);
  });

  it("builds a supportive fallback explanation using the correct answer", () => {
    expect(
      buildFallbackExplanation({
        correctChoiceText: "14",
        isMath: true,
      }),
    ).toContain("14");
  });
});