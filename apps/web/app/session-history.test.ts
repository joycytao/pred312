import { describe, expect, it } from "vitest";

import {
  createSavedSessionRecord,
  mergeSavedSessions,
  parseSavedSessions,
  type SavedSessionRecord,
} from "./session-history";

describe("session history", () => {
  it("creates a completed session record with result details", () => {
    const record = createSavedSessionRecord({
      grade: 1,
      subject: "math",
      ritLikeScore: 188,
      correctCount: 29,
      incorrectCount: 11,
      missedQuestionNumbers: [2, 8, 14],
      parentUserId: "parent-123",
      savedAt: "2026-05-06T10:15:00.000Z",
    });

    expect(record).toMatchObject({
      grade: 1,
      subject: "math",
      ritLikeScore: 188,
      correctCount: 29,
      incorrectCount: 11,
      missedQuestionNumbers: [2, 8, 14],
      parentUserId: "parent-123",
      savedAt: "2026-05-06T10:15:00.000Z",
    });
    expect(record.id).toBe("2026-05-06T10:15:00.000Z-math-grade-1");
  });

  it("keeps newest unique sessions first when merging", () => {
    const existing: SavedSessionRecord[] = [
      {
        id: "older",
        savedAt: "2026-05-05T10:00:00.000Z",
        grade: 1,
        subject: "ela",
        ritLikeScore: 172,
        correctCount: 24,
        incorrectCount: 16,
        missedQuestionNumbers: [1, 3],
      },
      {
        id: "middle",
        savedAt: "2026-05-06T08:00:00.000Z",
        grade: 1,
        subject: "math",
        ritLikeScore: 181,
        correctCount: 27,
        incorrectCount: 13,
        missedQuestionNumbers: [4, 5],
      },
    ];

    const merged = mergeSavedSessions(existing, {
      id: "latest",
      savedAt: "2026-05-06T11:00:00.000Z",
      grade: 1,
      subject: "math",
      ritLikeScore: 190,
      correctCount: 31,
      incorrectCount: 9,
      missedQuestionNumbers: [6],
    });

    expect(merged.map((record) => record.id)).toEqual(["latest", "middle", "older"]);

    const deduped = mergeSavedSessions(merged, {
      id: "middle",
      savedAt: "2026-05-06T08:00:00.000Z",
      grade: 1,
      subject: "math",
      ritLikeScore: 181,
      correctCount: 27,
      incorrectCount: 13,
      missedQuestionNumbers: [4, 5],
    });

    expect(deduped.map((record) => record.id)).toEqual(["latest", "middle", "older"]);
  });

  it("ignores malformed stored history entries", () => {
    const parsed = parseSavedSessions([
      {
        id: "valid",
        savedAt: "2026-05-06T11:00:00.000Z",
        grade: 1,
        subject: "ela",
        ritLikeScore: 184,
        correctCount: 28,
        incorrectCount: 12,
        missedQuestionNumbers: [7, 10],
      },
      {
        id: 123,
      },
      null,
    ]);

    expect(parsed).toEqual([
      {
        id: "valid",
        savedAt: "2026-05-06T11:00:00.000Z",
        grade: 1,
        subject: "ela",
        ritLikeScore: 184,
        correctCount: 28,
        incorrectCount: 12,
        missedQuestionNumbers: [7, 10],
      },
    ]);
  });
});