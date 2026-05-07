import { mergeSavedSessions, type SavedSessionRecord } from "./session-history";

type ResolvePreferredGradeInput = {
  localGrade: number;
  profileGrade?: number;
};

type BuildSignedInSessionStateInput = {
  remoteSessions: SavedSessionRecord[];
  localSessions: SavedSessionRecord[];
};

export function resolvePreferredGrade(input: ResolvePreferredGradeInput) {
  return typeof input.profileGrade === "number" ? input.profileGrade : input.localGrade;
}

export function buildSignedInSessionState(input: BuildSignedInSessionStateInput) {
  const remoteSessionIds = new Set(input.remoteSessions.map((record) => record.id));
  const pendingUploads = input.localSessions.filter((record) => !remoteSessionIds.has(record.id));
  const sessions = pendingUploads.reduce(
    (records, record) => mergeSavedSessions(records, record),
    input.remoteSessions,
  );

  return {
    sessions,
    pendingUploads,
  };
}
