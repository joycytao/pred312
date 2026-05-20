import { describe, expect, it } from "vitest";

import type { PrepdogQuestion } from "@prepdog/content";

import { getQuestionSpeechText } from "./question-speech";

const question: PrepdogQuestion = {
  id: "q-1",
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
  speechText: "What is 2 + 3? A. 5. B. 4.",
};

describe("getQuestionSpeechText", () => {
  it("reads only the prompt text and not the answer choices", () => {
    expect(getQuestionSpeechText(question)).toBe("What is 2 + 3?");
  });
});
