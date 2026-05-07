import { buildDemoQuestionBank, type PrepdogQuestion, type Subject } from "@prepdog/content";

export async function resolveQuestionBank({
  grade,
  subject,
  loadRemoteQuestions,
}: {
  grade: number;
  subject: Subject;
  loadRemoteQuestions: () => Promise<PrepdogQuestion[]>;
}) {
  try {
    const remoteQuestions = await loadRemoteQuestions();
    if (remoteQuestions.length > 0) {
      return remoteQuestions;
    }
  } catch {
    // Fall back to local demo content when Firestore is unavailable.
  }

  return buildDemoQuestionBank(grade, subject);
}