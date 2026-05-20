import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createInteraction = vi.fn();
const addQuestion = vi.fn();
const collection = vi.fn(() => ({ add: addQuestion }));
const getAdminFirestore = vi.fn(() => ({ collection }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = {
      create: createInteraction,
    };
  },
}));

vi.mock("@prepdog/firebase", () => ({
  getAdminFirestore,
}));

describe("POST /chinese/api/generate", () => {
  beforeEach(() => {
    vi.resetModules();
    createInteraction.mockReset();
    addQuestion.mockReset();
    collection.mockClear();
    getAdminFirestore.mockClear();
    process.env.GEMINI_API_KEY = "gemini-test-key";
    delete process.env.CHINESE_ADMIN_SECRET;
    delete process.env.NEXT_PUBLIC_CHINESE_APP_ID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid generation payloads", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/chinese/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resourceText: "  ", count: 0 }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Resource text is required and count must be 5, 10, 20, or 50.",
    });
  });

  it("does not require an admin secret header", async () => {
    createInteraction.mockResolvedValue({
      outputs: [
        {
          type: "text",
          text: JSON.stringify({
            questions: [
              {
                text: "春天到了，花____了。",
                answer: "開",
                options: ["關", "閞"],
              },
            ],
          }),
        },
      ],
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/chinese/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceText: "春天到了，花開了。",
          count: 10,
        }),
      }),
    );

    expect(response.status).toBe(200);
  });

  it("generates, normalizes, and stores chinese questions under the scoped artifact path", async () => {
    createInteraction.mockResolvedValue({
      outputs: [
        {
          type: "text",
          text: JSON.stringify({
            questions: [
              {
                text: "春天到了，花____了。",
                answer: "開",
                options: ["關", "閞"],
              },
            ],
          }),
        },
      ],
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/chinese/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resourceText: "春天到了，花開了。",
          count: 10,
          appId: "malicious-app",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      savedCount: 1,
      questions: [
        {
          text: "春天到了，花____了。",
          answer: "開",
          options: ["關", "閞", "開"],
          sourceText: "春天到了，花開了。",
          createdAt: expect.any(String),
        },
      ],
    });
    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3-flash-preview",
      }),
    );
    expect(collection).toHaveBeenCalledWith("artifacts/chinese-learning-app/public/data/questions");
    expect(addQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "春天到了，花____了。",
        answer: "開",
        sourceText: "春天到了，花開了。",
      }),
    );
  });

  it("prefers uploaded file content over stale textarea text when both are submitted", async () => {
    createInteraction.mockResolvedValue({
      outputs: [
        {
          type: "text",
          text: JSON.stringify({
            questions: [
              {
                text: "春天到了，花____了。",
                answer: "開",
                options: ["關", "閞"],
              },
            ],
          }),
        },
      ],
    });

    const formData = new FormData();
    formData.set("file", new File(["這是新的教材內容"], "lesson.txt", { type: "text/plain" }));
    formData.set("resourceText", "這是舊的貼上內容");
    formData.set("count", "10");

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/chinese/api/generate", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("這是新的教材內容"),
      }),
    );
    expect(createInteraction).not.toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("這是舊的貼上內容"),
      }),
    );
  });

  it("returns a structured JSON error for unsupported upload types", async () => {
    const formData = new FormData();
    formData.set("file", new File(["not-a-document"], "lesson.png", { type: "image/png" }));
    formData.set("count", "10");

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/chinese/api/generate", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported file type. Upload .txt, .md, .pdf, .doc, or .docx.",
    });
  });
});