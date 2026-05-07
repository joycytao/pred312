import { beforeEach, describe, expect, it, vi } from "vitest";

const certMock = vi.fn((value) => value);
const initializeAppMock = vi.fn(() => ({ name: "admin-app" }));
const getAppsMock = vi.fn(() => []);
const getFirestoreMock = vi.fn(() => ({ batch: vi.fn() }));

vi.mock("firebase-admin/app", () => ({
  cert: certMock,
  getApps: getAppsMock,
  initializeApp: initializeAppMock,
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: getFirestoreMock,
}));

describe("getAdminFirestore", () => {
  beforeEach(() => {
    vi.resetModules();
    certMock.mockClear();
    initializeAppMock.mockClear();
    getAppsMock.mockReset();
    getAppsMock.mockReturnValue([]);
    getFirestoreMock.mockClear();

    process.env.FIREBASE_PROJECT_ID = "demo-project";
    process.env.FIREBASE_CLIENT_EMAIL = "firebase-adminsdk@example.com";
    process.env.FIREBASE_PRIVATE_KEY = "line-1\\nline-2";
    delete process.env.FIRESTORE_DATABASE_ID;
  });

  it("uses the configured Firestore database id when provided", async () => {
    process.env.FIRESTORE_DATABASE_ID = "prepdog-content";

    const { getAdminFirestore } = await import("./index");

    getAdminFirestore();

    expect(getFirestoreMock).toHaveBeenCalledWith({ name: "admin-app" }, "prepdog-content");
  });

  it("defaults to the default Firestore database when no database id is configured", async () => {
    const { getAdminFirestore } = await import("./index");

    getAdminFirestore();

    expect(getFirestoreMock).toHaveBeenCalledWith({ name: "admin-app" });
  });
});