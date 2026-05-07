import { NextResponse } from "next/server";

import { loadQuestionsForGradeAndSubject } from "@prepdog/firebase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedGrade = Number(searchParams.get("grade") ?? 1);
  const requestedSubject = searchParams.get("subject");

  if (!Number.isFinite(requestedGrade) || requestedGrade < 1) {
    return NextResponse.json({ error: "Invalid grade." }, { status: 400 });
  }

  if (requestedSubject !== "ela" && requestedSubject !== "math") {
    return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
  }

  const questions = await loadQuestionsForGradeAndSubject({
    grade: requestedGrade,
    subject: requestedSubject,
  });

  return NextResponse.json({ questions });
}
