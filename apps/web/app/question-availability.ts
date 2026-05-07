import type { Subject } from "@prepdog/content";

const SUBJECT_LABELS: Record<Subject, string> = {
  ela: "English Language Arts",
  math: "Math",
};

export function getQuestionAvailabilityMessage({
  grade,
  subject,
}: {
  grade: number;
  subject: Subject;
}) {
  const label = SUBJECT_LABELS[subject];

  if (grade > 1) {
    return `Grade ${grade} ${label} has not been imported yet. Import the Grade ${grade} question pool first, or switch back to Grade 1 to use the demo question set.`;
  }

  return `No ${label} questions are available right now. The Grade 1 demo question set may not be loaded yet.`;
}