export type Subject = "math" | "ela";

export type DifficultyBand = "low" | "medium" | "high";

export type AssessmentQuestion = {
	id: string;
	difficultyLevel: number;
	difficultyBand: DifficultyBand;
	domain: string;
};

export type AssessmentState = {
	grade: number;
	subject: Subject;
	abilityEstimate: number;
	currentBand: DifficultyBand;
	questionNumber: number;
	correctCount: number;
	incorrectCount: number;
	ritLikeScore: number;
	usedQuestionIds: string[];
	recentDomains: string[];
};

export type EvaluateAnswerInput = {
	question: AssessmentQuestion;
	isCorrect: boolean;
};

const MIN_ABILITY = 1;
const MAX_ABILITY = 10;
const INITIAL_ABILITY_BY_GRADE: Record<number, number> = {
	1: 5,
	2: 5.8,
	3: 6.3,
};
const MAP_LIKE_BASELINE_BY_GRADE: Record<number, number> = {
	1: 174,
	2: 181,
	3: 188,
	4: 194,
	5: 200,
	6: 205,
};
const MAP_LIKE_POINTS_PER_ABILITY = 8;

export function createInitialAssessmentState(input: {
	grade: number;
	subject: Subject;
}): AssessmentState {
	const abilityEstimate = INITIAL_ABILITY_BY_GRADE[input.grade] ?? 5;

	return {
		grade: input.grade,
		subject: input.subject,
		abilityEstimate,
		currentBand: difficultyBandForAbility(abilityEstimate),
		questionNumber: 1,
		correctCount: 0,
		incorrectCount: 0,
		ritLikeScore: ritLikeScoreForAbility(abilityEstimate, input.grade),
		usedQuestionIds: [],
		recentDomains: [],
	};
}

export function evaluateAnswer(
	state: AssessmentState,
	input: EvaluateAnswerInput,
): AssessmentState {
	const delta = input.isCorrect ? 1.1 : -1.2;
	const nextAbility = clampAbility(
		state.abilityEstimate + delta + (input.question.difficultyLevel - 5) * 0.1,
	);

	return {
		...state,
		abilityEstimate: nextAbility,
		currentBand: difficultyBandForAbility(nextAbility),
		questionNumber: state.questionNumber + 1,
		correctCount: state.correctCount + (input.isCorrect ? 1 : 0),
		incorrectCount: state.incorrectCount + (input.isCorrect ? 0 : 1),
		ritLikeScore: ritLikeScoreForAbility(nextAbility, state.grade),
		usedQuestionIds: [...state.usedQuestionIds, input.question.id],
		recentDomains: [...state.recentDomains, input.question.domain].slice(-3),
	};
}

export function selectNextQuestion<TQuestion extends AssessmentQuestion>(
	state: AssessmentState,
	questions: TQuestion[],
): TQuestion | undefined {
	const unusedQuestions = questions.filter(
		(question) => !state.usedQuestionIds.includes(question.id),
	);

	const bandCandidates = unusedQuestions.filter(
		(question) => question.difficultyBand === state.currentBand,
	);

	const candidates = bandCandidates.length > 0 ? bandCandidates : unusedQuestions;
	const unseenDomainCandidates = candidates.filter(
		(question) => !state.recentDomains.includes(question.domain),
	);

	return [...(unseenDomainCandidates.length > 0 ? unseenDomainCandidates : candidates)]
		.sort((left, right) => left.difficultyLevel - right.difficultyLevel)
		.at(0);
}

function clampAbility(abilityEstimate: number) {
	return Math.min(MAX_ABILITY, Math.max(MIN_ABILITY, roundToSingleDecimal(abilityEstimate)));
}

function difficultyBandForAbility(abilityEstimate: number): DifficultyBand {
	if (abilityEstimate >= 6) {
		return "high";
	}

	if (abilityEstimate <= 4.4) {
		return "low";
	}

	return "medium";
}

function ritLikeScoreForAbility(abilityEstimate: number, grade: number) {
	const gradeBaseline = MAP_LIKE_BASELINE_BY_GRADE[grade] ?? (174 + (grade - 1) * 6);
	const baselineAbility = INITIAL_ABILITY_BY_GRADE[grade] ?? 5;
	const rawScore = gradeBaseline + (abilityEstimate - baselineAbility) * MAP_LIKE_POINTS_PER_ABILITY;
	return Math.round(Math.min(220, Math.max(140, rawScore)));
}

function roundToSingleDecimal(value: number) {
	return Math.round(value * 10) / 10;
}
