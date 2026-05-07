import { describe, expect, it } from "vitest";

import type { SavedSessionRecord } from "./session-history";
import {
  buildSignedInSessionState,
  resolvePreferredGrade,
} from "./parent-sync";

const remoteRecord: SavedSessionRecord = {
  id: "remote-1",
  savedAt: "2026-05-06T12:00:00.000Z",
  grade: 2,
  subject: "math",
  ritLikeScore: 192,
  correctCount: 30,
  incorrectCount: 10,
  missedQuestionNumbers: [3, 9],
};

const localOnlyRecord: SavedSessionRecord = {
  id: "local-1",
  savedAt: "2026-05-06T10:00:00.000Z",
  grade: 1,
  subject: "ela",
  ritLikeScore: 181,
  correctCount: 27,
  incorrectCount: 13,
  missedQuestionNumbers: [4, 5],
};

describe("parent sync", () => {
  it("prefers the signed-in profile grade over a stale local grade", () => {
    expect(resolvePreferredGrade({ localGrade: 1, profileGrade: 3 })).toBe(3);
  });

  it("falls back to local grade when no profile grade exists", () => {
    expect(resolvePreferredGrade({ localGrade: 2, profileGrade: undefined })).toBe(2);
  });

  it("keeps remote sessions authoritative while identifying local-only sessions to upload", () => {
    const result = buildSignedInSessionState({
      remoteSessions: [remoteRecord],
      localSessions: [localOnlyRecord, remoteRecord],
    });

    expect(result.sessions.map((record) => record.id)).toEqual(["remote-1", "local-1"]);
    expect(result.pendingUploads.map((record) => record.id)).toEqual(["local-1"]);
  });
});