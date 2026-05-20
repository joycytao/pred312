import { describe, expect, it } from "vitest";

import { createInitialAssessmentState, evaluateAnswer, type AssessmentState } from "@prepdog/assessment";
import { buildDemoQuestionBank, type PrepdogQuestion } from "@prepdog/content";

import { createSessionOffset, selectSessionQuestion } from "./starting-question";

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
  it("derives different fresh-session offsets from the random seed", () => {
    expect(createSessionOffset({ questionCount: 5, randomValue: 0 })).toBe(0);
    expect(createSessionOffset({ questionCount: 5, randomValue: 0.39 })).toBe(1);
    expect(createSessionOffset({ questionCount: 5, randomValue: 0.99 })).toBe(4);
  });

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

  it("avoids showing the same domain on back-to-back questions when another domain is available", () => {
    const quotaQuestions: PrepdogQuestion[] = [
      {
        ...questions[0],
        id: "ops-medium",
        domain: "Operations & Algebraic Thinking",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "geometry-medium-a",
        domain: "Geometry",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "geometry-medium-b",
        domain: "Geometry",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "measurement-medium",
        domain: "Measurement & Data",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "measurement-medium-b",
        domain: "Measurement & Data",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "base-ten-medium",
        domain: "Number & Operations in Base Ten",
        difficultyLevel: 5,
      },
    ];

    const state: AssessmentState = {
      ...initialState,
      questionNumber: 5,
      usedQuestionIds: ["ops-medium", "measurement-medium", "base-ten-medium", "geometry-medium-a"],
      recentDomains: [],
    };

    const nextQuestion = selectSessionQuestion({
      state,
      questions: quotaQuestions,
      sessionOffset: 0,
    });

    expect(nextQuestion?.domain).not.toBe("Geometry");
  });

  it("prioritizes domains that are behind the current quota round", () => {
    const quotaQuestions: PrepdogQuestion[] = [
      {
        ...questions[0],
        id: "ops-medium-a",
        domain: "Operations & Algebraic Thinking",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "ops-medium-b",
        domain: "Operations & Algebraic Thinking",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "geometry-medium-a",
        domain: "Geometry",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "geometry-medium-b",
        domain: "Geometry",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "measurement-medium-a",
        domain: "Measurement & Data",
        difficultyLevel: 5,
      },
      {
        ...questions[0],
        id: "base-ten-medium-a",
        domain: "Number & Operations in Base Ten",
        difficultyLevel: 5,
      },
    ];

    const state: AssessmentState = {
      ...initialState,
      questionNumber: 5,
      usedQuestionIds: ["ops-medium-a", "ops-medium-b", "geometry-medium-a", "geometry-medium-b"],
      recentDomains: [],
    };

    const nextQuestion = selectSessionQuestion({
      state,
      questions: quotaQuestions,
      sessionOffset: 0,
    });

    expect(["Measurement & Data", "Number & Operations in Base Ten"]).toContain(nextQuestion?.domain);
  });

  it("can use nearby difficulty bands to avoid collapsing into one domain", () => {
    const crossBandQuestions: PrepdogQuestion[] = [
      {
        ...questions[0],
        id: "geometry-medium-a",
        domain: "Geometry",
        difficultyLevel: 5,
        difficultyBand: "medium",
      },
      {
        ...questions[0],
        id: "geometry-medium-b",
        domain: "Geometry",
        difficultyLevel: 6,
        difficultyBand: "medium",
      },
      {
        ...questions[0],
        id: "measurement-low-a",
        domain: "Measurement & Data",
        difficultyLevel: 4,
        difficultyBand: "low",
      },
      {
        ...questions[0],
        id: "base-ten-high-a",
        domain: "Number & Operations in Base Ten",
        difficultyLevel: 7,
        difficultyBand: "high",
      },
      {
        ...questions[0],
        id: "ops-low-a",
        domain: "Operations & Algebraic Thinking",
        difficultyLevel: 4,
        difficultyBand: "low",
      },
    ];

    const state: AssessmentState = {
      ...initialState,
      currentBand: "medium",
      abilityEstimate: 5.1,
      questionNumber: 5,
      usedQuestionIds: ["geometry-medium-a"],
      recentDomains: [],
    };

    const nextQuestion = selectSessionQuestion({
      state,
      questions: crossBandQuestions,
      sessionOffset: 0,
    });

    expect(nextQuestion?.domain).not.toBe("Geometry");
  });

  it("keeps fallback math sessions reasonably balanced across domains", () => {
    const demoQuestions = buildDemoQuestionBank(1, "math");
    const sessionOffset = createSessionOffset({ questionCount: demoQuestions.length, randomValue: 0.37 });
    let state = createInitialAssessmentState({ grade: 1, subject: "math" });
    const domainCounts = new Map<string, number>();

    for (let index = 0; index < 20; index += 1) {
      const nextQuestion = selectSessionQuestion({
        state,
        questions: demoQuestions,
        sessionOffset,
      });

      expect(nextQuestion).toBeDefined();

      if (!nextQuestion) {
        break;
      }

      domainCounts.set(nextQuestion.domain, (domainCounts.get(nextQuestion.domain) ?? 0) + 1);
      state = evaluateAnswer(state, {
        question: {
          id: nextQuestion.id,
          domain: nextQuestion.domain,
          difficultyLevel: nextQuestion.difficultyLevel,
          difficultyBand: nextQuestion.difficultyBand,
        },
        isCorrect: index % 2 === 0,
      });
    }

    expect(domainCounts.get("Operations & Algebraic Thinking") ?? 0).toBeGreaterThanOrEqual(4);
    expect(domainCounts.get("Number & Operations in Base Ten") ?? 0).toBeGreaterThanOrEqual(4);
    expect(domainCounts.get("Measurement & Data") ?? 0).toBeGreaterThanOrEqual(4);
    expect(domainCounts.get("Geometry") ?? 0).toBeGreaterThanOrEqual(4);
  });
});