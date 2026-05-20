import { describe, expect, it } from "vitest";

import {
  createInitialAssessmentState,
  evaluateAnswer,
  selectNextQuestion,
  type AssessmentQuestion,
} from "../src/index";

const questions: AssessmentQuestion[] = [
  {
    id: "q-low-1",
    difficultyLevel: 3,
    difficultyBand: "low",
    domain: "Operations & Algebraic Thinking",
  },
  {
    id: "q-low-2",
    difficultyLevel: 4,
    difficultyBand: "low",
    domain: "Geometry",
  },
  {
    id: "q-mid-1",
    difficultyLevel: 5,
    difficultyBand: "medium",
    domain: "Operations & Algebraic Thinking",
  },
  {
    id: "q-mid-2",
    difficultyLevel: 6,
    difficultyBand: "medium",
    domain: "Measurement & Data",
  },
  {
    id: "q-high-1",
    difficultyLevel: 8,
    difficultyBand: "high",
    domain: "Number & Operations in Base Ten",
  },
];

describe("adaptive engine", () => {
  it("starts grade 1 sessions in the medium band", () => {
    const state = createInitialAssessmentState({ grade: 1, subject: "math" });

    expect(state.abilityEstimate).toBe(5);
    expect(state.currentBand).toBe("medium");
    expect(state.questionNumber).toBe(1);
    expect(state.ritLikeScore).toBe(174);
  });

  it("moves ability upward after a correct answer", () => {
    const initial = createInitialAssessmentState({ grade: 1, subject: "math" });

    const updated = evaluateAnswer(initial, {
      question: questions[2],
      isCorrect: true,
    });

    expect(updated.abilityEstimate).toBeGreaterThan(initial.abilityEstimate);
    expect(updated.currentBand).toBe("high");
    expect(updated.correctCount).toBe(1);
    expect(updated.incorrectCount).toBe(0);
  });

  it("moves ability downward after an incorrect answer", () => {
    const initial = createInitialAssessmentState({ grade: 1, subject: "math" });

    const updated = evaluateAnswer(initial, {
      question: questions[2],
      isCorrect: false,
    });

    expect(updated.abilityEstimate).toBeLessThan(initial.abilityEstimate);
    expect(updated.currentBand).toBe("low");
    expect(updated.correctCount).toBe(0);
    expect(updated.incorrectCount).toBe(1);
  });

  it("prefers an unanswered question in the current difficulty band while varying domains", () => {
    const state = {
      ...createInitialAssessmentState({ grade: 1, subject: "math" }),
      currentBand: "medium" as const,
      usedQuestionIds: ["q-mid-1"],
      recentDomains: ["Operations & Algebraic Thinking"],
    };

    const nextQuestion = selectNextQuestion(state, questions);

    expect(nextQuestion?.id).toBe("q-mid-2");
  });

  it("produces a bounded RIT-like score after multiple responses", () => {
    let state = createInitialAssessmentState({ grade: 1, subject: "math" });

    state = evaluateAnswer(state, { question: questions[2], isCorrect: true });
    state = evaluateAnswer(state, { question: questions[4], isCorrect: true });
    state = evaluateAnswer(state, { question: questions[1], isCorrect: false });

    expect(state.ritLikeScore).toBeGreaterThanOrEqual(150);
    expect(state.ritLikeScore).toBeLessThanOrEqual(230);
  });
});
