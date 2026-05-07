import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createInteraction = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = {
      create: createInteraction,
    };
  },
}));

describe("POST /api/explain", () => {
  beforeEach(() => {
    vi.resetModules();
    createInteraction.mockReset();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses Gemini when GEMINI_API_KEY is configured", async () => {
    process.env.GEMINI_API_KEY = "gemini-test-key";
    createInteraction.mockResolvedValue({
      outputs: [{ type: "text", text: "Try counting the stickers left after giving some away." }],
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost:3000/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: 1,
          subject: "math",
          prompt: "Milo had 17 stickers. He gave away 3. How many stickers does he have now?",
          choices: [
            { id: "A", text: "14" },
            { id: "B", text: "16" },
          ],
          correctChoiceId: "A",
          selectedChoiceId: "B",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      explanation: "Try counting the stickers left after giving some away.",
    });
    expect(createInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-3-flash-preview",
      }),
    );
  });
});