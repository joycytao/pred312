import { describe, expect, it } from "vitest";

import type { AssessmentState } from "@prepdog/assessment";

import {
  buildAnswerTransition,
  getVisibleQuestionNumber,
} from "./assessment-flow";

const currentState: AssessmentState = {
  grade: 1,
  subject: "math",
  abilityEstimate: 5,
  currentBand: "medium",
  questionNumber: 1,
  correctCount: 0,
  incorrectCount: 0,
  ritLikeScore: 186,
  usedQuestionIds: [],
  recentDomains: [],
};

const nextState: AssessmentState = {
  ...currentState,
  questionNumber: 2,
  incorrectCount: 1,
  abilityEstimate: 3.9,
  currentBand: "low",
  ritLikeScore: 176,
};

describe("assessment flow", () => {
  it("defers advancing the visible question after an incorrect answer until explanation is dismissed", () => {
    const transition = buildAnswerTransition({
      currentState,
      nextState,
      isCorrect: false,
      isFinalQuestion: false,
    });

    expect(transition.nextAssessmentState).toBe(currentState);
    expect(transition.pendingAssessmentState).toEqual(nextState);
    expect(transition.showExplanation).toBe(true);
    expect(getVisibleQuestionNumber({ assessmentState: transition.nextAssessmentState })).toBe(1);
  });

  it("advances immediately after a correct answer", () => {
    const transition = buildAnswerTransition({
      currentState,
      nextState,
      isCorrect: true,
      isFinalQuestion: false,
    });

    expect(transition.nextAssessmentState).toEqual(nextState);
    expect(transition.pendingAssessmentState).toBeNull();
    expect(transition.showExplanation).toBe(false);
  });
});