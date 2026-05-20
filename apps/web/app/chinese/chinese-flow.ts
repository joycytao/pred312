export type ChineseMode = "student" | "admin";
export type ChineseGenerationTransport = "server" | "client";
export type ChineseQuestionBankAccess = "public-firestore";
export type ChineseSpeechTransport = "gemini" | "browser";

const CHINESE_CLIENT_TEXT_GENERATION_MODEL = "gemini-2.5-flash";

export type ChineseQuestion = {
  text: string;
  answer: string;
  options: string[];
  sourceText: string;
  createdAt: string;
};

type SearchParamsLike = {
  get(name: string): string | null;
};

type SamplePracticeQuestionsInput = {
  questions: ChineseQuestion[];
  maxQuestions?: number;
  randomValue?: number;
};

type AnswerFeedbackInput = {
  selectedAnswer: string;
  correctAnswer: string;
};

type NormalizeGeneratedQuestionsInput = {
  sourceText: string;
  createdAt: string;
  questions: unknown;
};

type BuildGenerationPromptInput = {
  sourceText: string;
  count: number;
};

type GeneratedQuestionCandidate = {
  text?: unknown;
  answer?: unknown;
  options?: unknown;
};

const DEFAULT_MAX_QUESTIONS = 20;

export function getChineseMode(searchParams: SearchParamsLike | null | undefined): ChineseMode {
  return searchParams?.get("mode") === "admin" ? "admin" : "student";
}

export function buildChineseQuestionCollectionSegments(appId: string) {
  return ["artifacts", appId, "public", "data", "questions"] as const;
}

export function buildChineseQuestionCollectionPath(appId: string) {
  return buildChineseQuestionCollectionSegments(appId).join("/");
}

export function samplePracticeQuestions({
  questions,
  maxQuestions = DEFAULT_MAX_QUESTIONS,
  randomValue = 0,
}: SamplePracticeQuestionsInput) {
  if (questions.length === 0) {
    return [];
  }

  const requestedCount = Math.max(1, Math.min(maxQuestions, DEFAULT_MAX_QUESTIONS, questions.length));
  const normalizedRandomValue = Number.isFinite(randomValue) ? Math.max(0, randomValue) : 0;
  const startOffset = Math.floor(normalizedRandomValue * questions.length) % questions.length;

  return Array.from({ length: requestedCount }, (_, index) => {
    return questions[(startOffset + index) % questions.length];
  });
}

export function buildAnswerFeedback({ selectedAnswer, correctAnswer }: AnswerFeedbackInput) {
  const normalizedSelection = selectedAnswer.trim();
  const normalizedAnswer = correctAnswer.trim();
  const isCorrect = normalizedSelection === normalizedAnswer;

  return {
    isCorrect,
    message: isCorrect
      ? `答對了，正確答案是${normalizedAnswer}。`
      : `你選擇的是${normalizedSelection}，正確答案是${normalizedAnswer}。`,
    shouldRevealCorrectAnswer: !isCorrect,
  };
}

export function normalizeGeneratedQuestions({
  sourceText,
  createdAt,
  questions,
}: NormalizeGeneratedQuestionsInput): ChineseQuestion[] {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.flatMap((candidate) => {
    const { text, answer, options } = candidate as GeneratedQuestionCandidate;
    const normalizedText = typeof text === "string" ? text.trim() : "";
    const normalizedAnswer = typeof answer === "string" ? answer.trim() : "";

    if (!normalizedText || !normalizedAnswer || !Array.isArray(options)) {
      return [];
    }

    const normalizedOptions = Array.from(
      new Set(
        options
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .concat(normalizedAnswer),
      ),
    );

    if (normalizedOptions.length < 3 || !normalizedText.includes("____")) {
      return [];
    }

    return [{
      text: normalizedText,
      answer: normalizedAnswer,
      options: normalizedOptions,
      sourceText,
      createdAt,
    }];
  });
}

export function buildGenerationPrompt({ sourceText, count }: BuildGenerationPromptInput) {
  return [
    `你是國小中文老師。請根據教材設計 ${count} 題國小識字填空題。`,
    "每一題都要具備教學意義，並且只測一個關鍵字。",
    "錯誤選項必須符合形似、音近或形聲原則，不可亂碼，不可無意義。",
    "題目文字必須包含 ____ 作為挖空位置。",
    '請只輸出 JSON，格式為 {"questions":[{"text":"...____...","answer":"字","options":["干擾字1","干擾字2"],"sourceText":"教材摘要"}]}.',
    `教材內容：${sourceText}`,
  ].join("\n");
}

export function isStaticFirebaseHostingEnabled(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === "1" || normalizedValue === "true";
}

export function getChineseGenerationTransport(input: { staticFirebaseHosting: boolean }): ChineseGenerationTransport {
  return input.staticFirebaseHosting ? "client" : "server";
}

export function getChineseQuestionBankAccess(): ChineseQuestionBankAccess {
  return "public-firestore";
}

export function getChineseClientTextGenerationModel() {
  return CHINESE_CLIENT_TEXT_GENERATION_MODEL;
}

export function buildQuestionReadAloudText(input: Pick<ChineseQuestion, "text" | "answer">) {
  return input.text.replace(/____/g, input.answer);
}

export function getChineseSpeechTransport(input: {
  staticFirebaseHosting: boolean;
  hasGeminiApiKey: boolean;
}): ChineseSpeechTransport {
  if (input.staticFirebaseHosting && input.hasGeminiApiKey) {
    return "gemini";
  }

  return "browser";
}

export function summarizeSourceText(sourceText: string, maxLength = 180) {
  const normalized = sourceText.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function extractGeneratedQuestionsFromText(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as { questions?: unknown };
    return Array.isArray(parsed.questions) ? parsed.questions : [];
  } catch {
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as { questions?: unknown };
      return Array.isArray(parsed.questions) ? parsed.questions : [];
    } catch {
      return [];
    }
  }
}