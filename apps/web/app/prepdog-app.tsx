"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from "react";
import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, getFirestore, query, setDoc, where } from "firebase/firestore";

import {
  createInitialAssessmentState,
  evaluateAnswer,
  type AssessmentState,
} from "@prepdog/assessment";
import type { PrepdogQuestion, Subject } from "@prepdog/content";

import {
  buildAnswerTransition,
  getVisibleQuestionNumber,
} from "./assessment-flow";
import {
  buildFallbackExplanation,
} from "./explanation-fallback";
import { getQuestionSpeechText } from "./question-speech";
import { getQuestionAvailabilityMessage } from "./question-availability";
import { resolveQuestionBank } from "./question-source";
import {
  createSavedSessionRecord,
  mergeSavedSessions,
  readSavedSessionsFromStorage,
  type SavedSessionRecord,
  writeSavedSessionsToStorage,
} from "./session-history";
import {
  buildSignedInSessionState,
  resolvePreferredGrade,
} from "./parent-sync";
import {
  getParentAccountDescription,
  getSyncIndicator,
  PARENT_SYNC_MESSAGE,
  SUPPORTED_GRADES,
} from "./parent-settings";
import { createSessionOffset, selectSessionQuestion } from "./starting-question";
import { getSubjectForPathname, getSubjectPath } from "./subject-route";

type ResponseRecord = {
  questionNumber: number;
  questionId: string;
  isCorrect: boolean;
};

type ExplanationState = {
  title: string;
  body: string;
  isError?: boolean;
};

const SUBJECT_LABELS: Record<Subject, string> = {
  ela: "English Language Arts",
  math: "Math",
};

const TOTAL_QUESTIONS = 20;

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

function isFirebaseClientConfigured() {
  return Boolean(getFirebaseClientConfig());
}

function getFirebaseClientApp() {
  const config = getFirebaseClientConfig();
  if (!config) {
    return null;
  }

  return getApps().length > 0 ? getApp() : initializeApp(config);
}

export function PrepdogApp({ initialSubject = null }: { initialSubject?: Subject | null } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [grade, setGrade] = useState(() => {
    if (typeof window === "undefined") {
      return 1;
    }

    const storedGrade = window.localStorage.getItem("prepdog-grade");
    return storedGrade ? Number(storedGrade) : 1;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState(() =>
    isFirebaseClientConfigured() ? PARENT_SYNC_MESSAGE : "Using this device only until Firebase is configured.",
  );
  const [parentUser, setParentUser] = useState<User | null>(null);
  const [activeSubject, setActiveSubject] = useState<Subject | null>(null);
  const [questionBank, setQuestionBank] = useState<PrepdogQuestion[]>([]);
  const [assessmentState, setAssessmentState] = useState<AssessmentState | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<PrepdogQuestion | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [responses, setResponses] = useState<ResponseRecord[]>([]);
  const [explanation, setExplanation] = useState<ExplanationState | null>(null);
  const [pendingAssessmentState, setPendingAssessmentState] = useState<AssessmentState | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState<SavedSessionRecord[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    return readSavedSessionsFromStorage(window.localStorage);
  });
  const [isLoadingSavedSessions, setIsLoadingSavedSessions] = useState(() => isFirebaseClientConfigured());
  const [isLoadingQuestions, startLoadingQuestions] = useTransition();
  const [isExplaining, startExplaining] = useTransition();
  const [isSubmittingAuth, startSubmittingAuth] = useTransition();
  const availableGrades = SUPPORTED_GRADES;
  const routeSubject = getSubjectForPathname(pathname);
  const requestedSubject = initialSubject ?? routeSubject;
  const gradeRef = useRef(grade);
  const sessionStartOffsetRef = useRef(0);
  const isFirebaseReady = isFirebaseClientConfigured();
  const syncIndicator = getSyncIndicator({
    isFirebaseConfigured: isFirebaseReady,
    isSignedIn: Boolean(parentUser),
    isLoading: isLoadingSavedSessions,
  });
  const syncIndicatorClass = {
    amber: "bg-amber-100 text-amber-900",
    emerald: "bg-emerald-100 text-emerald-900",
    sky: "bg-sky-100 text-sky-900",
  }[syncIndicator.tone];

  useEffect(() => {
    gradeRef.current = grade;
    window.localStorage.setItem("prepdog-grade", String(grade));
  }, [grade]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const app = getFirebaseClientApp();
    if (!app) {
      return;
    }

    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setParentUser(user);
      setIsLoadingSavedSessions(true);

      if (!user) {
        setAuthStatus(PARENT_SYNC_MESSAGE);
        setSavedSessions(readSavedSessionsFromStorage(window.localStorage));
        setIsLoadingSavedSessions(false);
        return;
      }

      setAuthStatus(`Signed in as ${user.email ?? user.uid}`);

      try {
        const [profile, remoteSessions] = await Promise.all([
          loadParentProfile(user.uid),
          loadSavedSessionsFromFirebase(user.uid),
        ]);
        const localSessions = readSavedSessionsFromStorage(window.localStorage);
        const nextGrade = resolvePreferredGrade({
          localGrade: gradeRef.current,
          profileGrade: profile?.selectedDefaultGrade,
        });
        const syncedState = buildSignedInSessionState({
          remoteSessions,
          localSessions,
        });

        setNoticeMessage(null);
        setGrade(nextGrade);
        setSavedSessions(syncedState.sessions);

        await Promise.all(syncedState.pendingUploads.map((record) => saveSessionToFirebase(record, user.uid)));
      } catch {
        setAuthStatus(`Signed in as ${user.email ?? user.uid}. Cloud history is temporarily unavailable.`);
        setSavedSessions(readSavedSessionsFromStorage(window.localStorage));
      } finally {
        setIsLoadingSavedSessions(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!parentUser) {
      return;
    }

    void syncParentProfile(parentUser, grade);
  }, [grade, parentUser]);

  const beginAssessmentForRoute = useEffectEvent((subject: Subject) => {
    void beginAssessment(subject);
  });

  useEffect(() => {
    if (!requestedSubject || activeSubject || assessmentState || currentQuestion || isLoadingQuestions) {
      return;
    }

    beginAssessmentForRoute(requestedSubject);
  }, [requestedSubject, activeSubject, assessmentState, currentQuestion, isLoadingQuestions]);

  const progressValue = useMemo(() => (responses.length / TOTAL_QUESTIONS) * 100, [responses.length]);
  const correctCount = useMemo(
    () => responses.filter((response) => response.isCorrect).length,
    [responses],
  );
  const incorrectCount = responses.length - correctCount;
  const missedQuestionNumbers = useMemo(
    () => responses.filter((response) => !response.isCorrect).map((response) => response.questionNumber),
    [responses],
  );
  const hasCompletedTest = responses.length >= TOTAL_QUESTIONS || (assessmentState?.questionNumber ?? 1) > TOTAL_QUESTIONS;

  async function beginAssessment(subject: Subject) {
    startLoadingQuestions(async () => {
      const questions = await resolveQuestionBank({
        grade,
        subject,
        loadRemoteQuestions: async () => {
          const app = getFirebaseClientApp();
          if (!app) {
            return [];
          }

          const snapshot = await getDocs(
            query(
              collection(getFirestore(app), "questions"),
              where("grade", "==", grade),
              where("subject", "==", subject),
              where("isActive", "==", true),
            ),
          );

          return snapshot.docs.map((document) => document.data() as PrepdogQuestion);
        },
      });
      const initialState = createInitialAssessmentState({ grade, subject });
            const sessionOffset = createSessionOffset({
              questionCount: questions.length,
              randomValue: readSessionRandomValue(),
            });
      const firstQuestion = selectSessionQuestion({
        state: initialState,
        questions,
              sessionOffset,
      });

      if (!firstQuestion) {
        setNoticeMessage(getQuestionAvailabilityMessage({ grade, subject }));
        return;
      }

            sessionStartOffsetRef.current = sessionOffset;

      setActiveSubject(subject);
      setQuestionBank(questions);
      setAssessmentState(initialState);
      setCurrentQuestion(firstQuestion ?? null);
      setPendingAssessmentState(null);
      setNoticeMessage(null);
      setSessionStartedAt(new Date().toISOString());
      setResponses([]);
      setSelectedChoiceId(null);
      setExplanation(null);
    });
  }

  function speakQuestion() {
    if (!currentQuestion || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(getQuestionSpeechText(currentQuestion));
    utterance.rate = 0.75;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function handleContinueAfterExplanation(nextState?: AssessmentState | null) {
    const resolvedState = nextState ?? pendingAssessmentState;

    if (!resolvedState) {
      setExplanation(null);
      return;
    }

    if (responses.length >= TOTAL_QUESTIONS) {
      return;
    }

    const nextQuestion = selectSessionQuestion({
      state: resolvedState,
      questions: questionBank,
      sessionOffset: sessionStartOffsetRef.current,
    });
    setAssessmentState(resolvedState);
    setCurrentQuestion(nextQuestion ?? null);
    setPendingAssessmentState(null);
    setSelectedChoiceId(null);
    setExplanation(null);
  }

  async function handleSubmitAnswer() {
    if (!assessmentState || !currentQuestion || !selectedChoiceId) {
      return;
    }

    const isCorrect = selectedChoiceId === currentQuestion.correctChoiceId;
    const questionNumber = responses.length + 1;
    const nextResponses = [
      ...responses,
      { questionNumber, questionId: currentQuestion.id, isCorrect },
    ];
    const nextState = evaluateAnswer(assessmentState, {
      question: {
        id: currentQuestion.id,
        difficultyLevel: currentQuestion.difficultyLevel,
        difficultyBand: currentQuestion.difficultyBand,
        domain: currentQuestion.domain,
      },
      isCorrect,
    });
    const transition = buildAnswerTransition({
      currentState: assessmentState,
      nextState,
      isCorrect,
      isFinalQuestion: questionNumber >= TOTAL_QUESTIONS,
    });

    setResponses(nextResponses);

    if (questionNumber >= TOTAL_QUESTIONS) {
      setAssessmentState(nextState);
      setCurrentQuestion(null);
      setPendingAssessmentState(null);
      setSelectedChoiceId(null);
      void persistCompletedSession({
        grade,
        subject: assessmentState.subject,
        initialAbility: createInitialAssessmentState({ grade, subject: assessmentState.subject }).abilityEstimate,
        finalAbility: nextState.abilityEstimate,
        ritLikeScore: nextState.ritLikeScore,
        correctCount: nextState.correctCount,
        incorrectCount: nextState.incorrectCount,
        missedQuestionNumbers: nextResponses.filter((response) => !response.isCorrect).map((response) => response.questionNumber),
        questionOrder: nextResponses.map((response) => response.questionId),
      });
      return;
    }

    if (isCorrect) {
      handleContinueAfterExplanation(transition.nextAssessmentState);
      return;
    }

    startExplaining(async () => {
      const fallbackExplanation = buildFallbackExplanation({
        correctChoiceText:
          currentQuestion.choices.find((choice) => choice.id === currentQuestion.correctChoiceId)?.text ??
          "the correct choice",
        isMath: assessmentState.subject === "math",
      });

      try {
        const response = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grade,
            subject: activeSubject,
            prompt: currentQuestion.prompt,
            choices: currentQuestion.choices,
            correctChoiceId: currentQuestion.correctChoiceId,
            selectedChoiceId,
          }),
        });

        if (!response.ok) {
          throw new Error("Explanation request failed");
        }

        const payload = (await response.json()) as { explanation: string; fallback?: boolean };
        setExplanation({
          title: payload.fallback ? "Explanation unavailable" : "Let's learn from this one",
          body: payload.fallback ? fallbackExplanation : payload.explanation,
          isError: payload.fallback,
        });
      } catch {
        setExplanation({
          title: "Let's learn from this one",
          body: fallbackExplanation,
        });
      }

      setAssessmentState(transition.nextAssessmentState);
      setPendingAssessmentState(transition.pendingAssessmentState);
      setSelectedChoiceId(null);
    });
  }

  function resetAssessment() {
    setActiveSubject(null);
    setQuestionBank([]);
    setAssessmentState(null);
    setCurrentQuestion(null);
    setSessionStartedAt(null);
    setSelectedChoiceId(null);
    setResponses([]);
    setExplanation(null);
    setPendingAssessmentState(null);
    setNoticeMessage(null);
  }

  function goHome() {
    resetAssessment();
    router.push("/");
  }

  function restartCurrentPractice() {
    if (!activeSubject || isLoadingQuestions) {
      return;
    }

    void beginAssessment(activeSubject);
  }

  async function persistCompletedSession(input: {
    grade: number;
    subject: Subject;
    initialAbility: number;
    finalAbility: number;
    ritLikeScore: number;
    correctCount: number;
    incorrectCount: number;
    missedQuestionNumbers: number[];
    questionOrder: string[];
  }) {
    const record = createSavedSessionRecord({
      startedAt: sessionStartedAt ?? undefined,
      savedAt: new Date().toISOString(),
      grade: input.grade,
      subject: input.subject,
      ritLikeScore: input.ritLikeScore,
      correctCount: input.correctCount,
      incorrectCount: input.incorrectCount,
      missedQuestionNumbers: input.missedQuestionNumbers,
      initialAbility: input.initialAbility,
      finalAbility: input.finalAbility,
      questionOrder: input.questionOrder,
      parentUserId: parentUser?.uid,
    });

    if (typeof window !== "undefined") {
      writeSavedSessionsToStorage(window.localStorage, record);
    }

    setSavedSessions((previous) => mergeSavedSessions(previous, record));

    if (!parentUser) {
      return;
    }

    try {
      await saveSessionToFirebase(record, parentUser.uid);
    } catch {
      setAuthStatus(`Signed in as ${parentUser.email ?? parentUser.uid}. Session saved locally; cloud sync failed.`);
    }
  }

  function handleParentGoogleSignIn() {
    startSubmittingAuth(async () => {
      const app = getFirebaseClientApp();
      if (!app) {
        setAuthStatus("Firebase client config is missing. Add the app env values to enable parent sign-in.");
        return;
      }

      try {
        const auth = getAuth(app);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });

        try {
          await signInWithPopup(auth, provider);
        } catch {
          await signInWithRedirect(auth, provider);
          setAuthStatus("Redirecting to Google sign-in...");
          return;
        }

        setAuthStatus("Signed in with Google.");
      } catch (error) {
        setAuthStatus(error instanceof Error ? error.message : "Parent authentication failed.");
      }
    });
  }

  async function handleSignOut() {
    const app = getFirebaseClientApp();
    if (!app) {
      setAuthStatus("Demo mode active");
      return;
    }

    await signOut(getAuth(app));
    setAuthStatus("Signed out");
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(255,245,215,0.94)_38%,_rgba(255,214,153,0.88)_100%)] text-slate-900">
      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-10">
        <button
          type="button"
          className="absolute right-4 top-4 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/80 text-2xl shadow-lg backdrop-blur transition hover:scale-105"
          onClick={() => setIsSettingsOpen((value) => !value)}
          aria-label="Open parent settings"
        >
          ⚙️
        </button>

        {isSettingsOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-20 bg-slate-950/20 backdrop-blur-[2px]"
              onClick={() => setIsSettingsOpen(false)}
              aria-label="Close parent settings"
            />
            <aside className="fixed inset-x-4 bottom-4 top-20 z-30 overflow-y-auto rounded-[2rem] border border-white/60 bg-[#fff8ed]/95 p-6 shadow-2xl backdrop-blur sm:left-auto sm:right-6 sm:w-[28rem] sm:max-w-[calc(100vw-3rem)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-700">Parent settings</p>
                  <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${syncIndicatorClass}`}>
                    {syncIndicator.label}
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-white/85 text-xl text-slate-700 shadow-sm transition hover:bg-white"
                  onClick={() => setIsSettingsOpen(false)}
                  aria-label="Close parent settings"
                >
                  ✕
                </button>
              </div>
              <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-slate-700">
                Grade
                <select
                  className="mt-2 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 outline-none"
                  value={grade}
                  onChange={(event) => {
                    setNoticeMessage(null);
                    setGrade(Number(event.target.value));
                  }}
                >
                  {availableGrades.map((availableGrade) => (
                    <option key={availableGrade} value={availableGrade}>
                      Grade {availableGrade}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-500">Imported question pools are grade-based. If a selected grade has no questions yet, the app will tell you before a test begins.</p>

              <div className="rounded-3xl bg-white px-4 py-4 shadow-inner">
                <p className="text-sm font-semibold text-slate-900">Parent account</p>
                <p className="mt-1 text-xs text-slate-500">
                  {getParentAccountDescription(isFirebaseReady)}
                </p>
                {parentUser ? (
                  <div className="mt-4 rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-900">{parentUser.displayName ?? "Google parent account"}</p>
                    <p className="mt-1 text-xs text-slate-500">{parentUser.email ?? parentUser.uid}</p>
                    <button
                      type="button"
                      className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-white"
                      onClick={handleSignOut}
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={isSubmittingAuth}
                    onClick={handleParentGoogleSignIn}
                  >
                    Continue with Google
                  </button>
                )}
                <p className="mt-3 text-xs text-slate-500">{authStatus}</p>
              </div>

              <div className="rounded-3xl bg-white px-4 py-4 shadow-inner">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Saved results</p>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    {parentUser ? "Firebase + local" : "Local history"}
                  </p>
                </div>
                {isLoadingSavedSessions ? (
                  <p className="mt-4 text-sm text-slate-500">Loading saved sessions...</p>
                ) : savedSessions.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {savedSessions.slice(0, 6).map((session) => (
                      <div key={session.id} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                              {SUBJECT_LABELS[session.subject]} · Grade {session.grade}
                            </p>
                            <p className="mt-2 text-lg font-semibold text-slate-900">MAP-like estimate {session.ritLikeScore}</p>
                          </div>
                          <p className="text-xs text-slate-500">{formatSavedAt(session.savedAt)}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                          <span className="rounded-full bg-emerald-100 px-3 py-1">Correct {session.correctCount}</span>
                          <span className="rounded-full bg-orange-100 px-3 py-1">Incorrect {session.incorrectCount}</span>
                          <span className="rounded-full bg-sky-100 px-3 py-1">
                            Missed {session.missedQuestionNumbers.length > 0 ? session.missedQuestionNumbers.join(", ") : "Perfect run"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-slate-500">
                    Completed tests will appear here so parents can review recent scores and missed question numbers.
                  </p>
                )}
              </div>
              </div>
            </aside>
          </>
        ) : null}

        <header className="flex flex-col gap-4 pt-14 sm:pt-8">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-amber-700">PrepDog adaptive practice</p>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="max-w-4xl font-[family-name:var(--font-display)] text-[clamp(3.3rem,8vw,6.5rem)] leading-[0.92] text-slate-900">
                Let&apos;s Get Started...
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
                Kids choose Math or English Language Arts, answer 20 adaptive questions, hear questions aloud, and get an AI teacher explanation after mistakes.
              </p>
            </div>
            <div className="rounded-[2rem] border border-white/60 bg-white/70 px-5 py-4 shadow-lg backdrop-blur xl:min-w-[18rem]">
              <p className="text-sm text-slate-500">Current grade</p>
              <p className="text-3xl font-bold text-slate-900">Grade {grade}</p>
              <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${syncIndicatorClass}`}>
                {syncIndicator.label}
              </p>
            </div>
          </div>
        </header>

        {noticeMessage ? (
          <div className="mt-6 rounded-[1.75rem] border border-amber-200 bg-white/80 px-5 py-4 text-sm leading-6 text-slate-700 shadow-lg backdrop-blur">
            {noticeMessage}
          </div>
        ) : null}

        {activeSubject && assessmentState ? (
          <main className="mt-8 grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
            {hasCompletedTest ? (
              <section className="relative overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/80 p-8 shadow-2xl backdrop-blur">
                <Fireworks />
                <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-600">Session complete</p>
                <h2 className="mt-4 font-[family-name:var(--font-display)] text-5xl text-slate-900">MAP-like estimate {assessmentState.ritLikeScore}</h2>
                <p className="mt-3 max-w-xl text-lg text-slate-700">
                  {SUBJECT_LABELS[activeSubject]} finished for Grade {grade}. Celebrate the progress, then check which question numbers need another look.
                </p>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
                  This is a PrepDog MAP-like estimate, not an official NWEA MAP Growth RIT score.
                </p>
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  <ResultStat label="Correct" value={correctCount} tone="green" />
                  <ResultStat label="Incorrect" value={incorrectCount} tone="orange" />
                  <ResultStat label="Questions" value={responses.length} tone="blue" />
                </div>
                <div className="mt-8 rounded-[2rem] bg-slate-950 px-6 py-5 text-white">
                  <p className="text-sm uppercase tracking-[0.25em] text-white/50">Missed question numbers</p>
                  <p className="mt-3 text-lg">
                    {missedQuestionNumbers.length > 0 ? missedQuestionNumbers.join(", ") : "Perfect run"}
                  </p>
                </div>
                <button
                  type="button"
                  className="mt-8 rounded-full bg-emerald-500 px-6 py-4 text-base font-bold text-white shadow-lg transition hover:bg-emerald-600"
                  onClick={resetAssessment}
                >
                  Start another test
                </button>
              </section>
            ) : currentQuestion ? (
              <section className="rounded-[2.5rem] border border-white/60 bg-white/80 p-6 shadow-2xl backdrop-blur sm:p-8">
                <div className="border-b border-amber-100 pb-5">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-700">{SUBJECT_LABELS[activeSubject]}</p>
                  <h2 className="mt-2 text-3xl font-bold text-slate-900">Question {getVisibleQuestionNumber({ assessmentState })} of {TOTAL_QUESTIONS}</h2>
                </div>

                <div className="mt-6 rounded-[2rem] bg-[#fff2cb] p-6 shadow-inner">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">{currentQuestion.domain}</p>
                      <p className="mt-4 text-2xl font-semibold leading-9 text-slate-900">{currentQuestion.prompt}</p>
                      {currentQuestion.imageUrls && currentQuestion.imageUrls.length > 0 ? (
                        <div className="mt-5 grid gap-4">
                          {currentQuestion.imageUrls.map((imageUrl, index) => (
                            <Image
                              key={imageUrl}
                              src={imageUrl}
                              alt={`Illustration for question ${getVisibleQuestionNumber({ assessmentState })}${currentQuestion.imageUrls && currentQuestion.imageUrls.length > 1 ? ` image ${index + 1}` : ""}`}
                              width={1200}
                              height={900}
                              sizes="(max-width: 640px) 100vw, 640px"
                              unoptimized
                              className="max-h-72 w-auto max-w-full rounded-[1.5rem] border border-amber-200 bg-white object-contain shadow-sm"
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-2xl shadow-sm transition hover:scale-105 hover:bg-amber-50"
                      onClick={speakQuestion}
                      aria-label="Read question aloud"
                    >
                      🗣️
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-4">
                  {currentQuestion.choices.map((choice) => {
                    const isSelected = selectedChoiceId === choice.id;
                    const isImageOnlyChoice = Boolean(choice.imageUrl) && choice.text === `Image option ${choice.id}`;
                    return (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => setSelectedChoiceId(choice.id)}
                        className={`flex items-center gap-4 rounded-[1.75rem] border px-5 py-4 text-left transition ${
                          isSelected
                            ? "border-emerald-500 bg-emerald-50 shadow-lg"
                            : "border-white bg-white shadow-sm hover:border-amber-300 hover:bg-amber-50"
                        }`}
                      >
                        <span className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-black ${isSelected ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-700"}`}>
                          {choice.id}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-3">
                          {choice.imageUrl ? (
                            <Image
                              src={choice.imageUrl}
                              alt={`Answer choice ${choice.id}`}
                              width={720}
                              height={480}
                              sizes="(max-width: 640px) 100vw, 320px"
                              unoptimized
                              className="max-h-44 w-auto max-w-full rounded-[1.25rem] border border-amber-200 bg-white object-contain shadow-sm"
                            />
                          ) : null}
                          {!isImageOnlyChoice ? (
                            <span className="text-lg font-medium text-slate-900">{choice.text}</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white/75 px-5 py-3 text-sm font-semibold text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:text-slate-900"
                      onClick={goHome}
                    >
                      <span className="text-base">⌂</span>
                      Home
                    </button>
                    <button
                      type="button"
                      disabled={isLoadingQuestions}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-amber-300 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,224,0.96))] px-5 py-3 text-sm font-semibold text-amber-900 shadow-[0_14px_32px_rgba(245,158,11,0.16)] ring-1 ring-white/70 transition duration-200 hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-[0_18px_38px_rgba(245,158,11,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={restartCurrentPractice}
                    >
                      <span className="text-base">↺</span>
                      Restart
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={!selectedChoiceId || isExplaining}
                    className="inline-flex items-center justify-center gap-3 rounded-full bg-[linear-gradient(135deg,#16a34a,#10b981)] px-7 py-4 text-base font-bold text-white shadow-[0_18px_40px_rgba(16,185,129,0.28)] ring-1 ring-emerald-300/40 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_44px_rgba(16,185,129,0.34)] disabled:cursor-not-allowed disabled:bg-emerald-300 disabled:shadow-none sm:self-end"
                    onClick={handleSubmitAnswer}
                  >
                    <span className="text-xl">✅</span>
                    Submit answer
                  </button>
                </div>
              </section>
            ) : null}

            <aside className="flex flex-col gap-6">
              <div className="rounded-[2rem] border border-white/60 bg-slate-950 p-6 text-white shadow-xl">
                <p className="text-sm uppercase tracking-[0.25em] text-white/50">Progress</p>
                <div className="mt-4 h-4 rounded-full bg-white/10">
                  <div className="h-4 rounded-full bg-emerald-400 transition-all" style={{ width: `${progressValue}%` }} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <InfoPill label="Correct" value={correctCount} />
                  <InfoPill label="Incorrect" value={incorrectCount} />
                </div>
              </div>

              <div className="rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-lg">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">Session notes</p>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                  <li>Adaptive difficulty moves up after correct answers and down after incorrect answers.</li>
                  <li>Questions are pulled from Firestore when configured, or demo content when not configured yet.</li>
                  <li>Parent settings in the top right control the grade.</li>
                </ul>
              </div>
            </aside>
          </main>
        ) : (
          <main className="mt-10 grid flex-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="grid gap-6 md:grid-cols-2">
              {(Object.keys(SUBJECT_LABELS) as Subject[]).map((subject) => (
                <button
                  key={subject}
                  type="button"
                  className={`group relative overflow-hidden rounded-[2.5rem] border border-white/60 p-8 text-left shadow-xl transition hover:-translate-y-1 hover:shadow-2xl ${
                    subject === "ela" ? "bg-[#fff7ef]" : "bg-[#edf8ff]"
                  }`}
                  onClick={() => router.push(getSubjectPath(subject))}
                >
                  <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-amber-400 via-orange-400 to-pink-500" />
                  <p className="mt-3 text-xs font-black uppercase tracking-[0.3em] text-slate-500">Start test</p>
                  <h2 className="mt-6 font-[family-name:var(--font-display)] text-4xl leading-none text-slate-900">
                    {SUBJECT_LABELS[subject]}
                  </h2>
                  <p className="mt-5 max-w-sm text-base leading-7 text-slate-700">
                    {subject === "ela"
                      ? "Practice punctuation, nouns, reading ideas, and sentence skills with gentle AI coaching after mistakes."
                      : "Practice addition, subtraction, shapes, and measurement with adaptive difficulty that follows each answer."}
                  </p>
                  <div className="mt-8 inline-flex rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition group-hover:bg-slate-700">
                    {isLoadingQuestions && activeSubject === subject ? "Loading..." : `Begin ${SUBJECT_LABELS[subject]}`}
                  </div>
                </button>
              ))}
            </section>

            <aside className="space-y-6">
              <div className="rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-xl backdrop-blur">
                <p className="text-sm font-black uppercase tracking-[0.25em] text-slate-500">How it works</p>
                <ol className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
                  <li>Choose a subject from the landing page.</li>
                  <li>Answer 20 adaptive questions for the selected grade.</li>
                  <li>Tap 🗣️ next to the question when your child wants to hear only the prompt.</li>
                  <li>Press ✅ only after checking the final answer choice.</li>
                </ol>
              </div>
              <div className="rounded-[2rem] border border-amber-200 bg-[#2e2118] p-6 text-amber-50 shadow-xl">
                <p className="text-sm uppercase tracking-[0.2em] text-amber-200">Environment</p>
                <p className="mt-3 text-lg font-semibold">
                  {isFirebaseReady ? "Firebase-ready" : "Demo-ready until Firebase is configured"}
                </p>
                <p className="mt-2 text-sm leading-6 text-amber-100/80">
                  The importer script can fill Firestore later with grade-based question pools. Until then, the app still runs with sample content.
                </p>
              </div>
            </aside>
          </main>
        )}

        {explanation && assessmentState ? (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/55 px-4">
            <div className="w-full max-w-2xl rounded-[2.5rem] border border-white/30 bg-white p-8 shadow-2xl">
              <p className={`text-xs font-black uppercase tracking-[0.3em] ${explanation.isError ? "text-rose-500" : "text-emerald-600"}`}>
                {explanation.title}
              </p>
              <p className="mt-5 text-xl leading-9 text-slate-900">{explanation.body}</p>
              <button
                type="button"
                className="mt-8 rounded-full bg-slate-900 px-6 py-4 font-bold text-white transition hover:bg-slate-700"
                onClick={() => handleContinueAfterExplanation()}
              >
                Continue to the next question
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.25em] text-white/50">{label}</p>
      <p className="mt-2 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "orange" | "blue";
}) {
  const toneClass = {
    blue: "bg-sky-50 text-sky-700",
    green: "bg-emerald-50 text-emerald-700",
    orange: "bg-orange-50 text-orange-700",
  }[tone];

  return (
    <div className={`rounded-[2rem] px-5 py-6 ${toneClass}`}>
      <p className="text-xs font-black uppercase tracking-[0.25em]">{label}</p>
      <p className="mt-3 text-4xl font-bold">{value}</p>
    </div>
  );
}

function Fireworks() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 18 }, (_, index) => (
        <span
          key={index}
          className="absolute h-4 w-4 rounded-full bg-[var(--spark-color)] opacity-70 animate-[spark_1.6s_ease-out_infinite]"
          style={{
            left: `${12 + (index % 6) * 14}%`,
            top: `${10 + Math.floor(index / 6) * 24}%`,
            animationDelay: `${index * 0.08}s`,
            ["--spark-color" as string]: ["#ff7b54", "#ffd166", "#38bdf8", "#34d399"][index % 4],
          }}
        />
      ))}
    </div>
  );
}

async function loadParentProfile(userId: string) {
  const app = getFirebaseClientApp();
  if (!app) {
    return null;
  }

  const snapshot = await getDoc(doc(getFirestore(app), "users", userId));
  return snapshot.exists() ? (snapshot.data() as { selectedDefaultGrade?: number }) : null;
}

async function syncParentProfile(user: User, grade: number) {
  const app = getFirebaseClientApp();
  if (!app) {
    return;
  }

  await setDoc(
    doc(getFirestore(app), "users", user.uid),
    {
      email: user.email ?? null,
      selectedDefaultGrade: grade,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

async function loadSavedSessionsFromFirebase(userId: string) {
  const app = getFirebaseClientApp();
  if (!app) {
    return [] as SavedSessionRecord[];
  }

  const snapshot = await getDocs(query(collection(getFirestore(app), "testSessions"), where("userId", "==", userId)));

  return snapshot.docs
    .map((document) => {
      const data = document.data();
      return {
        id: document.id,
        startedAt: typeof data.startedAt === "string" ? data.startedAt : undefined,
        savedAt: typeof data.finishedAt === "string" ? data.finishedAt : new Date(0).toISOString(),
        grade: typeof data.grade === "number" ? data.grade : 1,
        subject: data.subject === "ela" || data.subject === "math" ? data.subject : "math",
        ritLikeScore: typeof data.ritLikeScore === "number" ? data.ritLikeScore : 0,
        correctCount: typeof data.correctCount === "number" ? data.correctCount : 0,
        incorrectCount: typeof data.incorrectCount === "number" ? data.incorrectCount : 0,
        missedQuestionNumbers: Array.isArray(data.missedQuestionNumbers)
          ? data.missedQuestionNumbers.filter((value): value is number => typeof value === "number")
          : [],
        initialAbility: typeof data.initialAbility === "number" ? data.initialAbility : undefined,
        finalAbility: typeof data.finalAbility === "number" ? data.finalAbility : undefined,
        questionOrder: Array.isArray(data.questionOrder)
          ? data.questionOrder.filter((value): value is string => typeof value === "string")
          : undefined,
        parentUserId: typeof data.userId === "string" ? data.userId : userId,
      } satisfies SavedSessionRecord;
    })
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

async function saveSessionToFirebase(record: SavedSessionRecord, userId: string) {
  const app = getFirebaseClientApp();
  if (!app) {
    return;
  }

  await setDoc(doc(getFirestore(app), "testSessions", record.id), {
    userId,
    studentId: userId,
    grade: record.grade,
    subject: record.subject,
    status: "completed",
    startedAt: record.startedAt ?? record.savedAt,
    finishedAt: record.savedAt,
    initialAbility: record.initialAbility ?? null,
    finalAbility: record.finalAbility ?? null,
    ritLikeScore: record.ritLikeScore,
    correctCount: record.correctCount,
    incorrectCount: record.incorrectCount,
    questionOrder: record.questionOrder ?? [],
    missedQuestionNumbers: record.missedQuestionNumbers,
  });
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Saved recently";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function readSessionRandomValue() {
  if (typeof window !== "undefined" && "crypto" in window) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] / 4294967296;
  }

  return Math.random();
}
