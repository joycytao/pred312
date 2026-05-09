import type { Subject } from "@prepdog/content";

import { countImportedContent, deleteImportedContent } from "./firestore-rest";

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const counts = await countImportedContent(args);

  console.log(`Matched ${counts.poolCount} pools and ${counts.questionCount} questions.`);

  if (args.dryRun) {
    return;
  }

  await deleteImportedContent(args);

  console.log("Deletion complete.");
}

function parseArgs(argv: string[]) {
  const args = {
    grade: undefined as number | undefined,
    subject: undefined as Subject | undefined,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--grade" && next) {
      args.grade = Number(next);
      index += 1;
    } else if (current === "--subject" && next && (next === "math" || next === "ela")) {
      args.subject = next;
      index += 1;
    } else if (current === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});