import type { AssessmentState } from "@prepdog/assessment";
import type { PrepdogQuestion } from "@prepdog/content";

const BAND_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
} as const;

export function createSessionOffset({
  questionCount,
  randomValue,
}: {
  questionCount: number;
  randomValue: number;
}) {
  if (questionCount <= 0) {
    return 0;
  }

  const normalizedRandomValue = Math.min(Math.max(randomValue, 0), 0.999999999);
  return Math.floor(normalizedRandomValue * questionCount);
}

export function selectSessionQuestion({
  state,
  questions,
  sessionOffset,
}: {
  state: AssessmentState;
  questions: PrepdogQuestion[];
  sessionOffset: number;
}) {
  const unusedQuestions = questions.filter(
    (question) => !state.usedQuestionIds.includes(question.id),
  );
  const lastQuestionId = state.usedQuestionIds.at(-1);
  const lastQuestion = lastQuestionId
    ? questions.find((question) => question.id === lastQuestionId)
    : undefined;
  const domainUsageCounts = countUsedDomains(state.usedQuestionIds, questions);
  const availableDomains = [...new Set(questions.map((question) => question.domain))];
  const bandCandidates = unusedQuestions.filter(
    (question) => question.difficultyBand === state.currentBand,
  );
  const preferredQuestions = bandCandidates.length >= 2 ? bandCandidates : unusedQuestions;
  const recencyCandidates = preferredQuestions
    .filter((question) => !state.recentDomains.includes(question.domain))
    .concat(
      preferredQuestions.filter((question) =>
        state.recentDomains.includes(question.domain),
      ),
    );
  const quotaCandidates = filterCandidatesByDomainQuota({
    candidates: recencyCandidates,
    domainUsageCounts,
    availableDomains,
    usedQuestionCount: state.usedQuestionIds.length,
  });
  const candidates = filterConsecutiveDomainRepeat({
    candidates: quotaCandidates,
    lastDomain: lastQuestion?.domain,
    availableDomains,
  })
    .slice()
    .sort(
      (left, right) =>
        Math.abs(BAND_ORDER[left.difficultyBand] - BAND_ORDER[state.currentBand]) -
          Math.abs(BAND_ORDER[right.difficultyBand] - BAND_ORDER[state.currentBand]) ||
        compareDirectionFromLastQuestion(left, right, state.abilityEstimate, lastQuestion?.difficultyLevel) ||
        Math.abs(left.difficultyLevel - state.abilityEstimate) - Math.abs(right.difficultyLevel - state.abilityEstimate) ||
        (domainUsageCounts.get(left.domain) ?? 0) - (domainUsageCounts.get(right.domain) ?? 0) ||
        left.difficultyLevel - right.difficultyLevel ||
        left.id.localeCompare(right.id),
    );

  if (candidates.length === 0) {
    return undefined;
  }

  return candidates[((sessionOffset % candidates.length) + candidates.length) % candidates.length];
}

function filterCandidatesByDomainQuota({
  candidates,
  domainUsageCounts,
  availableDomains,
  usedQuestionCount,
}: {
  candidates: PrepdogQuestion[];
  domainUsageCounts: Map<string, number>;
  availableDomains: string[];
  usedQuestionCount: number;
}) {
  if (availableDomains.length < 3) {
    return candidates;
  }

  const completedRounds = Math.floor(usedQuestionCount / availableDomains.length);
  const underQuotaCandidates = candidates.filter(
    (question) => (domainUsageCounts.get(question.domain) ?? 0) <= completedRounds,
  );

  return underQuotaCandidates.length > 0 ? underQuotaCandidates : candidates;
}

function filterConsecutiveDomainRepeat({
  candidates,
  lastDomain,
  availableDomains,
}: {
  candidates: PrepdogQuestion[];
  lastDomain?: string;
  availableDomains: string[];
}) {
  if (!lastDomain || availableDomains.length < 3) {
    return candidates;
  }

  const differentDomainCandidates = candidates.filter(
    (question) => question.domain !== lastDomain,
  );

  return differentDomainCandidates.length > 0 ? differentDomainCandidates : candidates;
}

function compareDirectionFromLastQuestion(
  left: PrepdogQuestion,
  right: PrepdogQuestion,
  abilityEstimate: number,
  lastDifficultyLevel?: number,
) {
  if (typeof lastDifficultyLevel !== "number") {
    return 0;
  }

  const direction = Math.sign(abilityEstimate - lastDifficultyLevel);
  if (direction === 0) {
    return 0;
  }

  const leftPenalty = direction > 0
    ? Number(left.difficultyLevel < lastDifficultyLevel)
    : Number(left.difficultyLevel > lastDifficultyLevel);
  const rightPenalty = direction > 0
    ? Number(right.difficultyLevel < lastDifficultyLevel)
    : Number(right.difficultyLevel > lastDifficultyLevel);

  return leftPenalty - rightPenalty;
}

function countUsedDomains(usedQuestionIds: string[], questions: PrepdogQuestion[]) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const counts = new Map<string, number>();

  for (const questionId of usedQuestionIds) {
    const domain = questionById.get(questionId)?.domain;
    if (!domain) {
      continue;
    }

    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }

  return counts;
}