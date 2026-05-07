import { describe, expect, it } from "vitest";

import { getQuestionAvailabilityMessage } from "./question-availability";

describe("getQuestionAvailabilityMessage", () => {
  it("gives a grade-specific import message for grades without imported content", () => {
    expect(getQuestionAvailabilityMessage({ grade: 2, subject: "ela" })).toContain("Grade 2 English Language Arts");
    expect(getQuestionAvailabilityMessage({ grade: 2, subject: "ela" })).toContain("has not been imported yet");
  });

  it("uses a demo-friendly fallback for grade 1", () => {
    expect(getQuestionAvailabilityMessage({ grade: 1, subject: "math" })).toContain("demo question set");
  });
});