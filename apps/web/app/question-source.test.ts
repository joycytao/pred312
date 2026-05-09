import { describe, expect, it } from "vitest";

import type { PrepdogQuestion } from "@prepdog/content";

import { resolveQuestionBank } from "./question-source";

const remoteQuestion: PrepdogQuestion = {
  id: "remote-q1",
  grade: 1,
  subject: "math",
  domain: "Operations & Algebraic Thinking",
  cluster: "Represent and solve problems involving addition and subtraction",
  standardCode: "1.OA.A.1",
  prompt: "What is 2 + 3?",
  choices: [
    { id: "A", text: "5" },
    { id: "B", text: "4" },
  ],
  correctChoiceId: "A",
  difficultyLevel: 3,
  difficultyBand: "low",
  speechText: "What is 2 plus 3? A. 5. B. 4.",
};

describe("resolveQuestionBank", () => {
  it("returns Firestore questions when available", async () => {
    const result = await resolveQuestionBank({
      grade: 1,
      subject: "math",
      loadRemoteQuestions: async () => [remoteQuestion],
    });

    expect(result).toEqual([remoteQuestion]);
  });

  it("falls back to demo questions when Firestore is empty", async () => {
    const result = await resolveQuestionBank({
      grade: 1,
      subject: "math",
      loadRemoteQuestions: async () => [],
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.subject).toBe("math");
  });

  it("falls back to demo questions when Firestore lookup fails", async () => {
    const result = await resolveQuestionBank({
      grade: 1,
      subject: "ela",
      loadRemoteQuestions: async () => {
        throw new Error("firestore unavailable");
      },
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.subject).toBe("ela");
  });

  it("keeps only exact grade and subject matches from Firestore", async () => {
    const result = await resolveQuestionBank({
      grade: 1,
      subject: "math",
      loadRemoteQuestions: async () => [
        remoteQuestion,
        { ...remoteQuestion, id: "wrong-grade", grade: 2 },
        { ...remoteQuestion, id: "wrong-subject", subject: "ela" },
      ],
    });

    expect(result).toEqual([remoteQuestion]);
  });
});