import { describe, expect, it } from "vitest";

import type { AssessmentState } from "@prepdog/assessment";
import type { PrepdogQuestion } from "@prepdog/content";

import { selectSessionQuestion } from "./starting-question";

const initialState: AssessmentState = {
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

const questions: PrepdogQuestion[] = [
  {
    id: "q-mid-1",
    grade: 1,
    subject: "math",
    domain: "Operations & Algebraic Thinking",
    cluster: "Represent and solve problems involving addition and subtraction",
    standardCode: "1.OA.A.1",
    prompt: "Question 1",
    choices: [
      { id: "A", text: "1" },
      { id: "B", text: "2" },
      { id: "C", text: "3" },
      { id: "D", text: "4" },
    ],
    correctChoiceId: "A",
    difficultyLevel: 5,
    difficultyBand: "medium",
    speechText: "Question 1",
  },
  {
    id: "q-mid-2",
    grade: 1,
    subject: "math",
    domain: "Measurement & Data",
    cluster: "Measure lengths indirectly and by iterating length units",
    standardCode: "1.MD.A.1",
    prompt: "Question 2",
    choices: [
      { id: "A", text: "1" },
      { id: "B", text: "2" },
      { id: "C", text: "3" },
      { id: "D", text: "4" },
    ],
    correctChoiceId: "A",
    difficultyLevel: 6,
    difficultyBand: "medium",
    speechText: "Question 2",
  },
  {
    id: "q-low-1",
    grade: 1,
    subject: "math",
    domain: "Geometry",
    cluster: "Reason with shapes and their attributes",
    standardCode: "1.G.A.1",
    prompt: "Question 3",
    choices: [
      { id: "A", text: "1" },
      { id: "B", text: "2" },
      { id: "C", text: "3" },
      { id: "D", text: "4" },
    ],
    correctChoiceId: "A",
    difficultyLevel: 3,
    difficultyBand: "low",
    speechText: "Question 3",
  },
];

describe("selectSessionQuestion", () => {
  it("rotates the opening question across fresh sessions within the starting band", () => {
    const firstSessionQuestion = selectSessionQuestion({
      state: initialState,
      questions,
      sessionOffset: 0,
    });
    const restartedSessionQuestion = selectSessionQuestion({
      state: initialState,
      questions,
      sessionOffset: 1,
    });

    expect(firstSessionQuestion?.id).toBe("q-mid-1");
    expect(restartedSessionQuestion?.id).toBe("q-mid-2");
  });

  it("changes the follow-up question path for a restarted session with the same answer history", () => {
    const continuedState: AssessmentState = {
      ...initialState,
      questionNumber: 2,
      usedQuestionIds: ["q-mid-1"],
      recentDomains: ["Operations & Algebraic Thinking"],
    };

    const firstSessionQuestion = selectSessionQuestion({
      state: continuedState,
      questions,
      sessionOffset: 0,
    });
    const restartedSessionQuestion = selectSessionQuestion({
      state: continuedState,
      questions,
      sessionOffset: 1,
    });

    expect(firstSessionQuestion?.id).toBe("q-mid-2");
    expect(restartedSessionQuestion?.id).toBe("q-low-1");
  });

  it("moves difficulty up after a correct answer and down after an incorrect answer within the same band", () => {
    const directionalQuestions: PrepdogQuestion[] = [
      {
        ...questions[0],
        id: "q-mid-0",
        difficultyLevel: 4,
      },
      questions[0],
      questions[1],
    ];

    const higherAbilityState: AssessmentState = {
      ...initialState,
      abilityEstimate: 5.9,
      currentBand: "medium",
      questionNumber: 2,
      usedQuestionIds: ["q-mid-1"],
      recentDomains: [],
    };
    const lowerAbilityState: AssessmentState = {
      ...initialState,
      abilityEstimate: 4.6,
      currentBand: "medium",
      questionNumber: 2,
      usedQuestionIds: ["q-mid-1"],
      recentDomains: [],
    };

    const harderFollowUp = selectSessionQuestion({
      state: higherAbilityState,
      questions: directionalQuestions,
      sessionOffset: 0,
    });
    const easierFollowUp = selectSessionQuestion({
      state: lowerAbilityState,
      questions: directionalQuestions,
      sessionOffset: 0,
    });

    expect(harderFollowUp?.id).toBe("q-mid-2");
    expect(easierFollowUp?.id).toBe("q-mid-0");
  });

  it("prefers underused domains so a session stays mixed across question types", () => {
    const balancedQuestions: PrepdogQuestion[] = [
      {
        ...questions[0],
        id: "a-geometry-medium",
        domain: "Geometry",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "aa-geometry-medium-2",
        domain: "Geometry",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "b-measurement-medium",
        domain: "Measurement & Data",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "c-base-ten-medium",
        domain: "Number & Operations in Base Ten",
        difficultyLevel: 5,
      },
    ];

    const state: AssessmentState = {
      ...initialState,
      questionNumber: 4,
      usedQuestionIds: ["a-geometry-medium", "q-low-1", "q-mid-1"],
      recentDomains: [],
    };

    const nextQuestion = selectSessionQuestion({
      state,
      questions: [...balancedQuestions, ...questions],
      sessionOffset: 0,
    });

    expect(nextQuestion?.domain).not.toBe("Geometry");
  });
});