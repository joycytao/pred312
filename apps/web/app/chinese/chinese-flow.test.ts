import { describe, expect, it } from "vitest";

import {
  buildAnswerFeedback,
  getChineseClientTextGenerationModel,
  buildChineseQuestionCollectionPath,
  buildChineseQuestionCollectionSegments,
  buildGenerationPrompt,
  buildQuestionReadAloudText,
  getChineseGenerationTransport,
  getChineseMode,
  getChineseQuestionBankAccess,
  getChineseSpeechTransport,
  isStaticFirebaseHostingEnabled,
  normalizeGeneratedQuestions,
  samplePracticeQuestions,
  type ChineseQuestion,
} from "./chinese-flow";

const questionBank: ChineseQuestion[] = [
  {
    text: "他在公園裡看見一隻____鳥。",
    answer: "小",
    options: ["少", "曉"],
    sourceText: "公園課文",
    createdAt: "2026-05-12T00:00:00.000Z",
  },
  {
    text: "媽媽請我把書放回書____。",
    answer: "架",
    options: ["駕", "嫁"],
    sourceText: "公園課文",
    createdAt: "2026-05-12T00:00:00.000Z",
  },
  {
    text: "下雨了，記得帶____。",
    answer: "傘",
    options: ["散", "繖"],
    sourceText: "公園課文",
    createdAt: "2026-05-12T00:00:00.000Z",
  },
  {
    text: "我們一起去圖書____。",
    answer: "館",
    options: ["管", "棺"],
    sourceText: "公園課文",
    createdAt: "2026-05-12T00:00:00.000Z",
  },
];

describe("chinese flow", () => {
  it("defaults to student mode and only enables admin mode for the matching query flag", () => {
    expect(getChineseMode(new URLSearchParams())).toBe("student");
    expect(getChineseMode(new URLSearchParams("mode=teacher"))).toBe("student");
    expect(getChineseMode(new URLSearchParams("mode=admin"))).toBe("admin");
  });

  it("builds the shared Firestore collection path under the chinese artifact namespace", () => {
    expect(buildChineseQuestionCollectionSegments("chinese-learning-app")).toEqual([
      "artifacts",
      "chinese-learning-app",
      "public",
      "data",
      "questions",
    ]);
    expect(buildChineseQuestionCollectionPath("chinese-learning-app")).toBe(
      "artifacts/chinese-learning-app/public/data/questions",
    );
  });

  it("samples up to twenty questions by rotating from a deterministic offset", () => {
    expect(samplePracticeQuestions({ questions: questionBank, maxQuestions: 3, randomValue: 0.5 })).toEqual([
      questionBank[2],
      questionBank[3],
      questionBank[0],
    ]);
  });

  it("announces the selected and correct answer when a child misses a question", () => {
    expect(
      buildAnswerFeedback({
        selectedAnswer: "散",
        correctAnswer: "傘",
      }),
    ).toEqual({
      isCorrect: false,
      message: "你選擇的是散，正確答案是傘。",
      shouldRevealCorrectAnswer: true,
    });
  });

  it("includes the answer in the option set and filters malformed AI output", () => {
    const normalized = normalizeGeneratedQuestions({
      sourceText: "春天到了，花開了。",
      createdAt: "2026-05-12T00:00:00.000Z",
      questions: [
        {
          text: "春天到了，花____了。",
          answer: "開",
          options: ["關", "閞"],
        },
        {
          text: "",
          answer: "雨",
          options: ["語"],
        },
      ],
    });

    expect(normalized).toEqual([
      {
        text: "春天到了，花____了。",
        answer: "開",
        options: ["關", "閞", "開"],
        sourceText: "春天到了，花開了。",
        createdAt: "2026-05-12T00:00:00.000Z",
      },
    ]);
  });

  it("builds a constrained Gemini prompt for chinese literacy questions", () => {
    const prompt = buildGenerationPrompt({
      sourceText: "春眠不覺曉，處處聞啼鳥。",
      count: 10,
    });

    expect(prompt).toContain("設計 10 題國小識字填空題");
    expect(prompt).toContain("形似、音近或形聲");
    expect(prompt).toContain('"questions"');
    expect(prompt).toContain("sourceText");
  });

  it("detects static firebase hosting builds from the public runtime flag", () => {
    expect(isStaticFirebaseHostingEnabled("1")).toBe(true);
    expect(isStaticFirebaseHostingEnabled("true")).toBe(true);
    expect(isStaticFirebaseHostingEnabled("0")).toBe(false);
    expect(isStaticFirebaseHostingEnabled(undefined)).toBe(false);
  });

  it("uses client-side generation on static hosting and keeps server generation elsewhere", () => {
    expect(getChineseGenerationTransport({ staticFirebaseHosting: true })).toBe("client");
    expect(getChineseGenerationTransport({ staticFirebaseHosting: false })).toBe("server");
  });

  it("treats the chinese question bank as public firestore data rather than auth-gated state", () => {
    expect(getChineseQuestionBankAccess()).toBe("public-firestore");
  });

  it("uses a currently supported Gemini text model for client-side generation", () => {
    expect(getChineseClientTextGenerationModel()).toBe("gemini-2.5-flash");
  });

  it("reads the filled-in answer instead of the blank placeholder", () => {
    expect(buildQuestionReadAloudText({
      text: "春天到了，花____了。",
      answer: "開",
    })).toBe("春天到了，花開了。");
  });

  it("prefers Gemini speech on static hosting when a public Gemini key is available", () => {
    expect(getChineseSpeechTransport({ staticFirebaseHosting: true, hasGeminiApiKey: true })).toBe("gemini");
    expect(getChineseSpeechTransport({ staticFirebaseHosting: true, hasGeminiApiKey: false })).toBe("browser");
    expect(getChineseSpeechTransport({ staticFirebaseHosting: false, hasGeminiApiKey: true })).toBe("browser");
  });
});