import { describe, expect, it } from "vitest";

import { stripUndefinedFields } from "../src/index";

describe("stripUndefinedFields", () => {
  it("removes optional undefined fields before Firestore writes", () => {
    expect(
      stripUndefinedFields({
        id: "question-1",
        prompt: "How long is the smiley face?",
        imageUrls: undefined,
      }),
    ).toEqual({
      id: "question-1",
      prompt: "How long is the smiley face?",
    });
  });
});