export function shouldUseLocalExplanationFallback(flag?: string) {
  return flag === "1" || flag === "true";
}

export function buildFallbackExplanation({
  correctChoiceText,
  isMath,
}: {
  correctChoiceText: string;
  isMath: boolean;
}) {
  if (isMath) {
    return `Nice try. Let's slow down and check the numbers again. The correct answer is ${correctChoiceText}. Take a breath and try the next one.`;
  }

  return `Nice try. Let's look for the clue that fits best. The correct answer is ${correctChoiceText}. Take a breath and try the next one.`;
}