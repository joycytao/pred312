import type { PrepdogQuestion } from "@prepdog/content";

export function getQuestionSpeechText(question: Pick<PrepdogQuestion, "prompt" | "speechText">) {
  const prompt = question.prompt.trim();
  if (prompt.length > 0) {
    return prompt;
  }

  return question.speechText.trim();
}
