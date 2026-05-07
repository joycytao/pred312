import type { AssessmentState } from "@prepdog/assessment";

type AnswerTransitionInput = {
  currentState: AssessmentState;
  nextState: AssessmentState;
  isCorrect: boolean;
  isFinalQuestion: boolean;
};

type VisibleQuestionNumberInput = {
  assessmentState: AssessmentState | null;
};

export function buildAnswerTransition({
  currentState,
  nextState,
  isCorrect,
  isFinalQuestion,
}: AnswerTransitionInput) {
  if (isFinalQuestion || isCorrect) {
    return {
      nextAssessmentState: nextState,
      pendingAssessmentState: null,
      showExplanation: false,
    };
  }

  return {
    nextAssessmentState: currentState,
    pendingAssessmentState: nextState,
    showExplanation: true,
  };
}

export function getVisibleQuestionNumber({ assessmentState }: VisibleQuestionNumberInput) {
  return assessmentState?.questionNumber ?? 1;
}