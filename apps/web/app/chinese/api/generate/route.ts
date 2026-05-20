import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

import { getAdminFirestore } from "@prepdog/firebase";

import {
  buildChineseQuestionCollectionPath,
  buildGenerationPrompt,
  extractGeneratedQuestionsFromText,
  normalizeGeneratedQuestions,
  summarizeSourceText,
} from "../../chinese-flow";

const ALLOWED_COUNTS = new Set([5, 10, 20, 50]);
const DEFAULT_APP_ID = "chinese-learning-app";

type ParsedGenerationRequest = {
  count: number;
  resourceText: string;
};

type GeminiOutput = {
  type?: string;
  text?: string;
};

export async function POST(request: Request) {
  let parsedRequest: Awaited<ReturnType<typeof parseGenerationRequest>>;

  try {
    parsedRequest = await parseGenerationRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read the uploaded file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!parsedRequest.ok) {
    return NextResponse.json({ error: parsedRequest.error }, { status: parsedRequest.status });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Gemini API key is not configured." }, { status: 503 });
  }

  const firestore = getAdminFirestore();

  if (!firestore) {
    return NextResponse.json({ error: "Firebase Admin is not configured." }, { status: 503 });
  }

  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const generationResponse = await client.interactions.create({
      model: "gemini-3-flash-preview",
      input: buildGenerationPrompt({
        sourceText: parsedRequest.value.resourceText,
        count: parsedRequest.value.count,
      }),
    });

    const interactionText = (generationResponse.outputs as GeminiOutput[])
      .filter((output) => output.type === "text" && typeof output.text === "string")
      .map((output) => output.text?.trim() ?? "")
      .join("\n")
      .trim();

    const createdAt = new Date().toISOString();
    const sourceSummary = summarizeSourceText(parsedRequest.value.resourceText);
    const questions = normalizeGeneratedQuestions({
      sourceText: sourceSummary,
      createdAt,
      questions: extractGeneratedQuestionsFromText(interactionText),
    });

    if (questions.length === 0) {
      return NextResponse.json({ error: "Gemini did not return any valid questions." }, { status: 502 });
    }

    const collectionPath = buildChineseQuestionCollectionPath(resolveChineseAppId());
    await Promise.all(
      questions.map((question) =>
        firestore.collection(collectionPath).add({
          ...question,
        }),
      ),
    );

    return NextResponse.json({
      savedCount: questions.length,
      questions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chinese question generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function parseGenerationRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    const count = Number(formData.get("count") ?? 0);
    const inlineText = typeof formData.get("resourceText") === "string"
      ? String(formData.get("resourceText")).trim()
      : "";

    if (!ALLOWED_COUNTS.has(count)) {
      return {
        ok: false as const,
        status: 400,
        error: "Resource text is required and count must be 5, 10, 20, or 50.",
      };
    }

    if (!(file instanceof File)) {
      if (!inlineText) {
        return {
          ok: false as const,
          status: 400,
          error: "Resource text is required and count must be 5, 10, 20, or 50.",
        };
      }

      return {
        ok: true as const,
        value: {
          count,
          resourceText: inlineText,
        },
      };
    }

    const resourceText = (await extractTextFromFile(file)).trim();

    if (!resourceText) {
      return {
        ok: false as const,
        status: 400,
        error: "Uploaded file did not contain readable text.",
      };
    }

    return {
      ok: true as const,
      value: {
        count,
        resourceText,
      },
    };
  }

  const payload = (await request.json().catch(() => null)) as {
    appId?: unknown;
    count?: unknown;
    resourceText?: unknown;
  } | null;
  const count = Number(payload?.count ?? 0);
  const resourceText = typeof payload?.resourceText === "string" ? payload.resourceText.trim() : "";

  if (!resourceText || !ALLOWED_COUNTS.has(count)) {
    return {
      ok: false as const,
      status: 400,
      error: "Resource text is required and count must be 5, 10, 20, or 50.",
    };
  }

  return {
    ok: true as const,
    value: {
      count,
      resourceText,
    },
  };
}

function resolveChineseAppId() {
  if (process.env.NEXT_PUBLIC_CHINESE_APP_ID?.trim()) {
    return process.env.NEXT_PUBLIC_CHINESE_APP_ID.trim();
  }

  return DEFAULT_APP_ID;
}

async function extractTextFromFile(file: File) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
    return file.text();
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (lowerName.endsWith(".pdf")) {
    const pdfParseModule = await import("pdf-parse");
    const parser = new pdfParseModule.PDFParse({ data: buffer });

    try {
      const parsed = await parser.getText();
      return parsed.text;
    } finally {
      await parser.destroy();
    }
  }

  if (lowerName.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const extracted = await mammoth.extractRawText({ buffer });
    return extracted.value;
  }

  if (lowerName.endsWith(".doc")) {
    const wordExtractorModule = await import("word-extractor");
    const WordExtractor = (wordExtractorModule.default ?? wordExtractorModule) as new () => {
      extract(source: Buffer): Promise<{ getBody(): string }>;
    };
    const extractor = new WordExtractor();
    const document = await extractor.extract(buffer);
    return document.getBody();
  }

  throw new Error("Unsupported file type. Upload .txt, .md, .pdf, .doc, or .docx.");
}