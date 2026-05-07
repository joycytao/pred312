import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

type ExplainPayload = {
  grade: number;
  subject: "math" | "ela";
  prompt: string;
  choices: Array<{ id: string; text: string }>;
  correctChoiceId: string;
  selectedChoiceId: string;
};

type GeminiOutput = {
  type: string;
  text?: string;
};

const SYSTEM_PROMPT = `You are PrepDog's AI teacher. Explain mistakes to young children in a calm, encouraging way.
Use short sentences.
Use grade-appropriate vocabulary.
Explain why the correct answer makes sense.
Do not shame the child.
Do not mention scores or failure.
Keep the explanation under 120 words.`;

export async function POST(request: Request) {
  const payload = (await request.json()) as ExplainPayload;

  if (
    !payload ||
    !Number.isFinite(payload.grade) ||
    (payload.subject !== "math" && payload.subject !== "ela") ||
    !payload.prompt ||
    !Array.isArray(payload.choices) ||
    !payload.correctChoiceId ||
    !payload.selectedChoiceId
  ) {
    return NextResponse.json(
      { explanation: "Explanation is temporarily unavailable. Take a breath and try the next question.", fallback: true },
      { status: 400 },
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      explanation: "Explanation is temporarily unavailable. Take a breath and try the next question.",
      fallback: true,
    });
  }

  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.interactions.create({
      model: "gemini-3-flash-preview",
      input: `${SYSTEM_PROMPT}\n\nGrade: ${payload.grade}\nSubject: ${payload.subject}\nQuestion: ${payload.prompt}\nChoices: ${payload.choices
        .map((choice) => `${choice.id}. ${choice.text}`)
        .join(" | ")}\nChild selected: ${payload.selectedChoiceId}\nCorrect answer: ${payload.correctChoiceId}\nExplain this in a warm, kid-friendly way.`,
    });

    const explanation = (response.outputs as GeminiOutput[])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join(" ")
      .trim();

    return NextResponse.json({
      explanation: explanation || "Explanation is temporarily unavailable. Take a breath and try the next question.",
    });
  } catch {
    return NextResponse.json({
      explanation: "Explanation is temporarily unavailable. Take a breath and try the next question.",
      fallback: true,
    });
  }
}
