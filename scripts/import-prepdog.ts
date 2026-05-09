import { extractGradePagePools, parsePrepDogTestPage, type Subject } from "@prepdog/content";

import { upsertImportedQuestionPoolViaRest } from "./firestore-rest";

const BASE_URL = "https://www.prepdog.org";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const subjects = args.subject ? [args.subject] : (["ela", "math"] as Subject[]);

  for (const subject of subjects) {
    const gradeUrl = `${BASE_URL}/${ordinalFolder(args.grade)}/${args.grade}-COMMON.html`;
    const gradeHtml = await fetchText(gradeUrl);
    const pools = extractGradePagePools(gradeHtml, args.grade, subject);
    const limitedPools = args.limit ? pools.slice(0, args.limit) : pools;

    console.log(`Importing ${limitedPools.length} ${subject.toUpperCase()} pools for grade ${args.grade}`);

    for (const pool of limitedPools) {
      const testHtml = await fetchText(pool.sourceUrl);
      const importedPool = parsePrepDogTestPage(testHtml, pool);

      if (args.write === "json" || args.dryRun) {
        console.log(JSON.stringify(importedPool, null, 2));
        continue;
      }

      await upsertImportedQuestionPoolViaRest(importedPool);
      console.log(`Saved ${importedPool.questions.length} questions from ${pool.sourceUrl}`);
    }
  }
}

function parseArgs(argv: string[]) {
  const args = {
    grade: 1,
    subject: undefined as Subject | undefined,
    limit: undefined as number | undefined,
    dryRun: false,
    write: "firestore" as "firestore" | "json",
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
    } else if (current === "--limit" && next) {
      args.limit = Number(next);
      index += 1;
    } else if (current === "--dry-run") {
      args.dryRun = true;
      args.write = "json";
    } else if (current === "--write" && next && (next === "firestore" || next === "json")) {
      args.write = next;
      index += 1;
    }
  }

  return args;
}

function ordinalFolder(grade: number) {
  if (grade === 1) {
    return "1st";
  }

  if (grade === 2) {
    return "2nd";
  }

  if (grade === 3) {
    return "3rd";
  }

  return `${grade}th`;
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
