"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { addDoc, collection, getDocs, getFirestore } from "firebase/firestore";

import {
  buildAnswerFeedback,
  buildQuestionReadAloudText,
  getChineseClientTextGenerationModel,
  buildChineseQuestionCollectionSegments,
  buildGenerationPrompt,
  extractGeneratedQuestionsFromText,
  getChineseGenerationTransport,
  getChineseMode,
  getChineseQuestionBankAccess,
  getChineseSpeechTransport,
  isStaticFirebaseHostingEnabled,
  normalizeGeneratedQuestions,
  samplePracticeQuestions,
  summarizeSourceText,
  type ChineseQuestion,
} from "./chinese-flow";

const DEFAULT_APP_ID = "chinese-learning-app";
const QUIZ_LENGTH = 20;

type QuizAnswerState = {
  selectedAnswer: string;
  feedbackMessage: string;
  isCorrect: boolean;
  shouldRevealCorrectAnswer: boolean;
};

export function ChineseClientPage() {
  const searchParams = useSearchParams();
  const mode = getChineseMode(searchParams);
  const [resourceText, setResourceText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [questionCount, setQuestionCount] = useState(10);
  const [questionPool, setQuestionPool] = useState<ChineseQuestion[]>([]);
  const [sessionQuestions, setSessionQuestions] = useState<ChineseQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState<QuizAnswerState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [adminLog, setAdminLog] = useState<string[]>([
    "[系統] 使用 /chinese?mode=admin 進入老師模式",
  ]);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [isLoadingQuestions, startLoadingQuestions] = useTransition();
  const [isSavingQuestions, startSavingQuestions] = useTransition();
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geminiSpeechAbortRef = useRef<AbortController | null>(null);
  const activeGeminiAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeGeminiAudioUrlRef = useRef<string | null>(null);
  const activeGeminiPlaybackResolverRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentQuestion = sessionQuestions[currentIndex] ?? null;
  const appId = process.env.NEXT_PUBLIC_CHINESE_APP_ID?.trim() || DEFAULT_APP_ID;
  const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY?.trim() ?? "";
  const staticFirebaseHosting = isStaticFirebaseHostingEnabled(process.env.NEXT_PUBLIC_STATIC_FIREBASE_HOSTING);
  const generationTransport = getChineseGenerationTransport({ staticFirebaseHosting });
  const speechTransport = getChineseSpeechTransport({
    staticFirebaseHosting,
    hasGeminiApiKey: Boolean(geminiApiKey),
  });
  const hasCompletedSession = sessionQuestions.length > 0 && currentIndex >= sessionQuestions.length;
  const currentOptions = useMemo(
    () => (currentQuestion ? shuffleOptions(currentQuestion) : []),
    [currentQuestion],
  );

  const progressLabel = useMemo(() => {
    const total = sessionQuestions.length || QUIZ_LENGTH;
    const visibleIndex = Math.min(currentIndex + (currentQuestion ? 1 : 0), total);
    return `進度 ${visibleIndex} / ${total}`;
  }, [currentIndex, currentQuestion, sessionQuestions.length]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const app = getFirebaseClientApp();

    if (!app) {
      setStatusMessage("尚未設定 Firebase，老師模式無法同步雲端題庫。可先貼上教材測試畫面。");
      return;
    }

    setIsFirebaseReady(true);
    void loadQuestionPool(appId);

    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }

      stopActiveSpeech();
    };
  }, [appId]);

  useEffect(() => {
    if (!currentQuestion) {
      return;
    }

    void speakForQuestion(currentQuestion);
  }, [currentQuestion, speechTransport]);

  async function loadQuestionPool(activeAppId: string) {
    startLoadingQuestions(async () => {
      const app = getFirebaseClientApp();

      if (!app) {
        setQuestionPool([]);
        return;
      }

      try {
        const snapshot = await getDocs(
          collection(getFirestore(app), ...buildChineseQuestionCollectionSegments(activeAppId)),
        );
        const nextPool = snapshot.docs.map((document) => document.data() as ChineseQuestion);
        setQuestionPool(nextPool);

        if (mode === "student" && nextPool.length === 0) {
          setStatusMessage("資料庫目前沒有題目，請老師先到老師模式匯入教材。");
        }
      } catch {
        setStatusMessage("題庫讀取失敗，請稍後再試。");
      }
    });
  }

  function startSession() {
    if (questionPool.length === 0) {
      setStatusMessage("資料庫目前沒有題目，請老師先到老師模式匯入教材。");
      return;
    }

    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }

    stopActiveSpeech();

    const nextQuestions = samplePracticeQuestions({
      questions: shuffleQuestions(questionPool),
      maxQuestions: QUIZ_LENGTH,
      randomValue: Math.random(),
    });

    setSessionQuestions(nextQuestions);
    setCurrentIndex(0);
    setScore(0);
    setCurrentAnswer(null);
    setStatusMessage(null);
  }

  function chooseAnswer(answer: string) {
    if (!currentQuestion || currentAnswer) {
      return;
    }

    const feedback = buildAnswerFeedback({
      selectedAnswer: answer,
      correctAnswer: currentQuestion.answer,
    });

    if (feedback.isCorrect) {
      setScore((currentScore) => currentScore + 10);
    }

    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }

    setCurrentAnswer({
      selectedAnswer: answer,
      feedbackMessage: feedback.message,
      isCorrect: feedback.isCorrect,
      shouldRevealCorrectAnswer: feedback.shouldRevealCorrectAnswer,
    });
    void (async () => {
      await speakMessage(feedback.message);

      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }

      advanceTimerRef.current = setTimeout(() => {
        setCurrentAnswer(null);
        setCurrentIndex((index) => index + 1);
      }, 1600);
    })();
  }

  async function handleFileChange(file: File | null) {
    setSelectedFile(file);

    if (!file) {
      return;
    }

    appendAdminLog(`已選取檔案：${file.name}`);

    if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      const text = await file.text();
      setResourceText(text);
      return;
    }

    setResourceText("");
  }

  function appendAdminLog(message: string) {
    setAdminLog((currentLog) => [...currentLog, `[${new Date().toLocaleTimeString("zh-TW", { hour12: false })}] ${message}`]);
  }

  async function speakForQuestion(question: ChineseQuestion) {
    await speakMessage(buildQuestionReadAloudText(question));
  }

  async function speakMessage(text: string) {
    stopActiveSpeech();

    if (speechTransport === "gemini") {
      const controller = new AbortController();
      geminiSpeechAbortRef.current = controller;

      try {
        const audioBlob = await fetchGeminiSpeechBlob({
          text,
          geminiApiKey,
          signal: controller.signal,
        });
        await playGeminiAudio(audioBlob);
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      } finally {
        if (geminiSpeechAbortRef.current === controller) {
          geminiSpeechAbortRef.current = null;
        }
      }
    }

    speakText(text);
  }

  async function playGeminiAudio(audioBlob: Blob) {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    activeGeminiAudioRef.current = audio;
    activeGeminiAudioUrlRef.current = audioUrl;

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        if (activeGeminiPlaybackResolverRef.current === finalize) {
          activeGeminiPlaybackResolverRef.current = null;
        }
        if (activeGeminiAudioRef.current === audio) {
          activeGeminiAudioRef.current = null;
        }
        if (activeGeminiAudioUrlRef.current === audioUrl) {
          activeGeminiAudioUrlRef.current = null;
        }
        URL.revokeObjectURL(audioUrl);
      };

      const finalize = () => {
        cleanup();
        resolve();
      };

      activeGeminiPlaybackResolverRef.current = finalize;
      audio.onended = finalize;
      audio.onerror = () => {
        cleanup();
        reject(new Error("音訊播放失敗。"));
      };
      void audio.play().catch((error) => {
        cleanup();
        reject(error);
      });
    });
  }

  function stopActiveSpeech() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    geminiSpeechAbortRef.current?.abort();
    geminiSpeechAbortRef.current = null;

    if (activeGeminiAudioRef.current) {
      activeGeminiAudioRef.current.pause();
      activeGeminiAudioRef.current.currentTime = 0;
    }

    const resolvePlayback = activeGeminiPlaybackResolverRef.current;
    activeGeminiPlaybackResolverRef.current = null;
    resolvePlayback?.();

    if (!resolvePlayback && activeGeminiAudioUrlRef.current) {
      URL.revokeObjectURL(activeGeminiAudioUrlRef.current);
      activeGeminiAudioUrlRef.current = null;
      activeGeminiAudioRef.current = null;
    }
  }

  async function generateQuestions() {
    startSavingQuestions(async () => {
      try {
        appendAdminLog(`開始生成 ${questionCount} 題識字題目`);

        const payload = generationTransport === "client"
          ? await generateQuestionsOnClient({
              appId,
              count: questionCount,
              geminiApiKey,
              resourceText,
              selectedFile,
            })
          : await generateQuestionsOnServer({
              count: questionCount,
              resourceText,
              selectedFile,
            });

        appendAdminLog(`成功寫入 ${payload.savedCount ?? 0} 題到雲端題庫`);
        setStatusMessage(`已同步 ${payload.savedCount ?? 0} 題到 /chinese 題庫。`);
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        await loadQuestionPool(appId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "題目生成失敗。";
        appendAdminLog(`生成失敗：${message}`);
        setStatusMessage(message);
      }
    });
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f7efe1_0%,#fff9ef_32%,#dce9d6_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-slate-900/10 bg-[radial-gradient(circle_at_top_left,#fff8d8_0%,#fffdf5_45%,#f4f0e4_100%)] px-6 py-8 shadow-[0_24px_80px_rgba(82,63,22,0.12)] sm:px-8 lg:px-12">
          <div className="absolute -right-10 top-0 h-40 w-40 rounded-full bg-amber-200/50 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-40 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-700">Scoped Under /chinese</p>
              <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-none text-slate-900 sm:text-6xl">
                識字小達人
              </h1>
              <p className="mt-4 max-w-2xl font-[family-name:var(--font-body)] text-base leading-7 text-slate-700 sm:text-lg">
                以 `/chinese` 子路由獨立運作的中文識字練習。老師可匯入教材並直接生成題庫，學生則在同一份雲端資料上完成語音測驗。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-700">
              <span className="rounded-full bg-white/80 px-4 py-2 shadow-sm">{mode === "admin" ? "老師模式" : "學生模式"}</span>
              <span className="rounded-full bg-white/80 px-4 py-2 shadow-sm">題庫 {questionPool.length} 題</span>
              <span className="rounded-full bg-white/80 px-4 py-2 shadow-sm">{isFirebaseReady ? "Firebase 已連線" : "等待 Firebase"}</span>
            </div>
          </div>
        </section>

        {statusMessage ? (
          <div className="rounded-3xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">
            {statusMessage}
          </div>
        ) : null}

        {mode === "admin" ? (
          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[2rem] border border-slate-900/10 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-700">Teacher Studio</p>
                  <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl text-slate-900">教材轉題器</h2>
                </div>
                <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
                  Firestore 路徑：artifacts/{appId}/public/data/questions
                </div>
              </div>

              <label className="mt-6 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition hover:border-emerald-400 hover:bg-emerald-50/60">
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  accept=".txt,.md,.pdf,.doc,.docx"
                  onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
                />
                <span className="text-base font-black text-slate-800">拖放或點擊上傳教材</span>
                <span className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                  支援 `.txt`、`.md`、`.pdf`、`.doc`、`.docx`。文字檔會直接預覽；PDF 與 Word 會在送出時於伺服器端擷取內容。
                </span>
                <span className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm">
                  {selectedFile ? selectedFile.name : "尚未選取檔案"}
                </span>
              </label>

              <textarea
                className="mt-6 min-h-64 w-full rounded-[1.75rem] border border-slate-200 bg-white px-5 py-4 font-[family-name:var(--font-body)] text-base leading-7 text-slate-800 shadow-inner outline-none ring-0 transition focus:border-emerald-400"
                value={resourceText}
                onChange={(event) => setResourceText(event.target.value)}
                placeholder="也可以直接貼上課文、詩詞或自編教材內容..."
              />

              <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
                <select
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700"
                  value={questionCount}
                  onChange={(event) => setQuestionCount(Number(event.target.value))}
                >
                  <option value={5}>5 題</option>
                  <option value={10}>10 題</option>
                  <option value={20}>20 題</option>
                  <option value={50}>50 題</option>
                </select>
                <button
                  className="rounded-full bg-slate-900 px-6 py-3 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void generateQuestions()}
                  disabled={isSavingQuestions || (!resourceText.trim() && !selectedFile)}
                >
                  {isSavingQuestions ? "生成中..." : "開始 AI 轉換並寫入題庫"}
                </button>
              </div>
            </div>

            <aside className="rounded-[2rem] border border-slate-900/10 bg-slate-950 p-6 text-slate-100 shadow-[0_18px_50px_rgba(15,23,42,0.16)] sm:p-8">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-emerald-300">Sync Log</p>
              <div className="mt-5 space-y-3 rounded-[1.5rem] border border-white/10 bg-black/20 p-4 font-mono text-xs leading-6 text-emerald-200">
                {adminLog.map((entry, index) => (
                  <div key={`${index}-${entry}`}>{entry}</div>
                ))}
              </div>
              <div className="mt-6 rounded-[1.5rem] bg-white/5 p-4 text-sm leading-6 text-slate-300">
                雲端題庫透過 {getChineseQuestionBankAccess()} 直接共享給 `/chinese` 學生模式。重新載入後即可拿到新題目。
              </div>
            </aside>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[2rem] border border-slate-900/10 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">{progressLabel}</span>
                <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-900">得分 {score}</span>
              </div>

              {hasCompletedSession ? (
                <div className="flex min-h-[28rem] flex-col items-center justify-center text-center">
                  <p className="text-sm font-black uppercase tracking-[0.3em] text-emerald-700">Session Complete</p>
                  <h2 className="mt-4 font-[family-name:var(--font-display)] text-5xl text-slate-900">練習完成</h2>
                  <p className="mt-5 text-xl font-semibold text-slate-700">總得分 {score}</p>
                  <button
                    className="mt-8 rounded-full bg-slate-900 px-6 py-3 text-sm font-black text-white transition hover:bg-slate-700"
                    onClick={startSession}
                  >
                    再挑戰一次
                  </button>
                </div>
              ) : currentQuestion ? (
                <div className="mt-8">
                  <button
                    className="rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-blue-500"
                    onClick={() => void speakForQuestion(currentQuestion)}
                  >
                    重新朗讀題目
                  </button>
                  <div className="mt-8 min-h-32 rounded-[1.75rem] bg-slate-50 px-6 py-8 text-center font-[family-name:var(--font-display)] text-3xl leading-relaxed text-slate-900 sm:text-4xl">
                    {currentQuestion.text}
                  </div>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {currentOptions.map((option) => {
                      const isSelected = currentAnswer?.selectedAnswer === option;
                      const isCorrectAnswer = currentQuestion.answer === option;
                      const showCorrect = Boolean(currentAnswer?.shouldRevealCorrectAnswer && isCorrectAnswer);

                      return (
                        <button
                          key={option}
                          className={[
                            "rounded-[1.5rem] border px-5 py-5 text-left text-2xl font-black transition",
                            showCorrect ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50",
                            isSelected && !currentAnswer?.isCorrect ? "border-rose-400 bg-rose-50 text-rose-700" : "",
                            isSelected && currentAnswer?.isCorrect ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "",
                          ].join(" ")}
                          onClick={() => chooseAnswer(option)}
                          disabled={Boolean(currentAnswer)}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  {currentAnswer ? (
                    <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4 text-base font-semibold leading-7 text-slate-700">
                      {currentAnswer.feedbackMessage}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-[28rem] flex-col items-center justify-center text-center">
                  <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-700">Student Practice</p>
                  <h2 className="mt-4 font-[family-name:var(--font-display)] text-5xl text-slate-900">開始隨機測驗</h2>
                  <p className="mt-5 max-w-xl font-[family-name:var(--font-body)] text-lg leading-8 text-slate-700">
                    系統會從 `/chinese` 題庫中抽出最多 20 題，進入題目時自動朗讀，答錯時會直接說出你選的字和正確答案。
                  </p>
                  <button
                    className="mt-8 rounded-full bg-slate-900 px-6 py-3 text-sm font-black text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={startSession}
                    disabled={isLoadingQuestions || questionPool.length === 0}
                  >
                    {isLoadingQuestions ? "載入題庫中..." : "開始隨機測驗"}
                  </button>
                </div>
              )}
            </div>

            <aside className="rounded-[2rem] border border-slate-900/10 bg-[linear-gradient(180deg,#1f2937_0%,#111827_100%)] p-6 text-slate-100 shadow-[0_18px_50px_rgba(15,23,42,0.16)] sm:p-8">
              <p className="text-sm font-black uppercase tracking-[0.3em] text-amber-300">學習提示</p>
              <h3 className="mt-4 font-[family-name:var(--font-display)] text-3xl text-white">先聽，再選，再訂正</h3>
              <ul className="mt-6 space-y-4 font-[family-name:var(--font-body)] text-sm leading-7 text-slate-300">
                <li>進入題目會自動朗讀，若沒聽清楚可按「重新朗讀題目」。</li>
                <li>答錯時系統會直接說出「你選擇的是 xxx，正確答案是 ooo」。</li>
                <li>老師模式與學生模式共用同一個 `/chinese` Firestore 題庫，不會干擾首頁其他功能。</li>
              </ul>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}

function getFirebaseClientConfig(): FirebaseOptions | null {
  if (
    !process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    !process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    !process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  ) {
    return null;
  }

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function getFirebaseClientApp() {
  const config = getFirebaseClientConfig();

  if (!config) {
    return null;
  }

  return getApps().length > 0 ? getApp() : initializeApp(config);
}

function speakText(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-TW";
  utterance.rate = 0.82;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

async function fetchGeminiSpeechBlob(input: { text: string; geminiApiKey: string; signal?: AbortSignal }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(input.geminiApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: input.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: input.text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Kore",
              },
            },
          },
        },
      }),
    },
  );

  const result = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string };
        }>;
      };
    }>;
  };

  if (!response.ok) {
    throw new Error(result.error?.message ?? "Gemini 語音朗讀失敗。");
  }

  const audioData = result.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;

  if (!audioData) {
    throw new Error("Gemini did not return audio data.");
  }

  return pcmToWavBlob(audioData, 24000);
}

function pcmToWavBlob(base64Data: string, sampleRate: number) {
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);

  for (let index = 0; index < len; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + len, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, len, true);

  return new Blob([wavHeader, bytes], { type: "audio/wav" });
}

function shuffleQuestions(questions: ChineseQuestion[]) {
  return [...questions].sort(() => Math.random() - 0.5);
}

function shuffleOptions(question: ChineseQuestion) {
  return [...new Set([...question.options, question.answer])].sort(() => Math.random() - 0.5);
}

async function buildGenerateRequest(input: {
  resourceText: string;
  selectedFile: File | null;
  count: number;
}): Promise<RequestInit> {
  if (input.selectedFile) {
    const formData = new FormData();
    formData.set("file", input.selectedFile);
    formData.set("count", String(input.count));

    if (input.resourceText.trim()) {
      formData.set("resourceText", input.resourceText.trim());
    }

    return {
      method: "POST",
      body: formData,
    };
  }

  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      count: input.count,
      resourceText: input.resourceText.trim(),
    }),
  };
}

async function generateQuestionsOnServer(input: {
  resourceText: string;
  selectedFile: File | null;
  count: number;
}) {
  const requestInit = await buildGenerateRequest(input);
  const response = await fetch("/chinese/api/generate", requestInit);
  const payload = (await response.json()) as {
    error?: string;
    savedCount?: number;
    questions?: ChineseQuestion[];
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "題目生成失敗。");
  }

  return payload;
}

async function generateQuestionsOnClient(input: {
  appId: string;
  count: number;
  geminiApiKey: string;
  resourceText: string;
  selectedFile: File | null;
}) {
  if (!input.geminiApiKey) {
    throw new Error("尚未設定 NEXT_PUBLIC_GEMINI_API_KEY，static hosting 無法直接呼叫 Gemini。");
  }

  const app = getFirebaseClientApp();

  if (!app) {
    throw new Error("尚未設定 Firebase，無法寫入 Chinese 題庫。");
  }

  const sourceText = await resolveResourceText({
    resourceText: input.resourceText,
    selectedFile: input.selectedFile,
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${getChineseClientTextGenerationModel()}:generateContent?key=${encodeURIComponent(input.geminiApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildGenerationPrompt({ sourceText, count: input.count }) }] }],
        systemInstruction: {
          parts: [{ text: "你是國小中文老師，設計識字填空題。選項要有干擾力，且必須適合國小學生。" }],
        },
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );

  const result = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  if (!response.ok) {
    throw new Error(result.error?.message ?? "Gemini 題目生成失敗。");
  }

  const outputText = result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
  const createdAt = new Date().toISOString();
  const questions = normalizeGeneratedQuestions({
    sourceText: summarizeSourceText(sourceText),
    createdAt,
    questions: extractGeneratedQuestionsFromText(outputText),
  });

  if (questions.length === 0) {
    throw new Error("Gemini did not return any valid questions.");
  }

  const db = getFirestore(app);
  await Promise.all(
    questions.map((question) => addDoc(collection(db, ...buildChineseQuestionCollectionSegments(input.appId)), question)),
  );

  return {
    savedCount: questions.length,
    questions,
  };
}

async function resolveResourceText(input: { resourceText: string; selectedFile: File | null }) {
  if (input.selectedFile) {
    return extractTextFromSelectedFile(input.selectedFile);
  }

  const trimmedText = input.resourceText.trim();

  if (!trimmedText) {
    throw new Error("內容不能為空");
  }

  return trimmedText;
}

async function extractTextFromSelectedFile(file: File) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
    return file.text();
  }

  if (lowerName.endsWith(".pdf")) {
    throw new Error("Static hosting 目前只支援直接讀取 .txt 或 .md；PDF 請改用具備 API route 的環境。");
  }

  if (lowerName.endsWith(".doc") || lowerName.endsWith(".docx")) {
    throw new Error("Static hosting 目前只支援直接讀取 .txt 或 .md；Word 檔請改用具備 API route 的環境。");
  }

  throw new Error("Unsupported file type. Upload .txt, .md, .pdf, .doc, or .docx.");
}