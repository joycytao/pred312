import type { Subject } from "@prepdog/content";

export type SavedSessionRecord = {
  id: string;
  startedAt?: string;
  savedAt: string;
  grade: number;
  subject: Subject;
  ritLikeScore: number;
  correctCount: number;
  incorrectCount: number;
  missedQuestionNumbers: number[];
  initialAbility?: number;
  finalAbility?: number;
  questionOrder?: string[];
  parentUserId?: string;
};

export type CreateSavedSessionRecordInput = Omit<SavedSessionRecord, "id">;

export const LOCAL_SESSION_HISTORY_KEY = "prepdog-session-history";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function createSavedSessionRecord(input: CreateSavedSessionRecordInput): SavedSessionRecord {
  return {
    ...input,
    id: `${input.savedAt}-${input.subject}-grade-${input.grade}`,
  };
}

export function mergeSavedSessions(
  existing: SavedSessionRecord[],
  nextRecord: SavedSessionRecord,
  maxRecords = 12,
): SavedSessionRecord[] {
  const deduped = [nextRecord, ...existing.filter((record) => record.id !== nextRecord.id)];

  return deduped
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, maxRecords);
}

export function parseSavedSessions(value: unknown): SavedSessionRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isSavedSessionRecord)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export function readSavedSessionsFromStorage(storage: Pick<StorageLike, "getItem">): SavedSessionRecord[] {
  try {
    const rawValue = storage.getItem(LOCAL_SESSION_HISTORY_KEY);
    if (!rawValue) {
      return [];
    }

    return parseSavedSessions(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

export function writeSavedSessionsToStorage(
  storage: StorageLike,
  nextRecord: SavedSessionRecord,
  maxRecords = 12,
): SavedSessionRecord[] {
  const merged = mergeSavedSessions(readSavedSessionsFromStorage(storage), nextRecord, maxRecords);
  storage.setItem(LOCAL_SESSION_HISTORY_KEY, JSON.stringify(merged));
  return merged;
}

function isSavedSessionRecord(value: unknown): value is SavedSessionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SavedSessionRecord>;
  return Boolean(
    typeof candidate.id === "string" &&
      typeof candidate.savedAt === "string" &&
      typeof candidate.grade === "number" &&
      (candidate.subject === "ela" || candidate.subject === "math") &&
      typeof candidate.ritLikeScore === "number" &&
      typeof candidate.correctCount === "number" &&
      typeof candidate.incorrectCount === "number" &&
      Array.isArray(candidate.missedQuestionNumbers) &&
      candidate.missedQuestionNumbers.every((value) => typeof value === "number"),
  );
}