import { decode } from "html-entities";
import * as cheerio from "cheerio";

export type Subject = "math" | "ela";
export type DifficultyBand = "low" | "medium" | "high";

export type QuestionChoice = {
  id: string;
  text: string;
  imageUrl?: string;
};

export type PrepdogQuestion = {
  id: string;
  grade: number;
  subject: Subject;
  domain: string;
  cluster: string;
  standardCode: string;
  prompt: string;
  imageUrls?: string[];
  choices: QuestionChoice[];
  correctChoiceId: string;
  difficultyLevel: number;
  difficultyBand: DifficultyBand;
  speechText: string;
  sourceUrl?: string;
  sourceQuestionIndex?: number;
};

export type QuestionPool = {
  id: string;
  grade: number;
  subject: Subject;
  domain: string;
  cluster: string;
  standardCode: string;
  title: string;
  testNumber: number;
  sourceUrl: string;
};

export type ImportedQuestionPool = {
  pool: QuestionPool;
  questions: PrepdogQuestion[];
};

const MATH_DOMAINS = [
  {
    domain: "Operations & Algebraic Thinking",
    cluster: "Represent and solve problems involving addition and subtraction",
    standards: ["1.OA.A.1", "1.OA.A.2", "1.OA.B.3", "1.OA.B.4"],
  },
  {
    domain: "Number & Operations in Base Ten",
    cluster: "Understand place value",
    standards: ["1.NBT.A.1", "1.NBT.B.2", "1.NBT.B.3", "1.NBT.C.4"],
  },
  {
    domain: "Measurement & Data",
    cluster: "Tell and write time",
    standards: ["1.MD.A.1", "1.MD.A.2", "1.MD.B.3", "1.MD.C.4"],
  },
  {
    domain: "Geometry",
    cluster: "Reason with shapes and their attributes",
    standards: ["1.G.A.1", "1.G.A.3"],
  },
] as const;

const ELA_DOMAINS = [
  {
    domain: "Language",
    cluster: "Conventions of Standard English",
    standards: ["L.1.1.B", "L.1.1.C", "L.1.1.D", "L.1.2.B"],
  },
  {
    domain: "Reading",
    cluster: "Key Ideas and Details",
    standards: ["RL.1.1", "RL.1.2", "RI.1.1", "RI.1.2"],
  },
  {
    domain: "Foundational Skills",
    cluster: "Phonics and Word Recognition",
    standards: ["RF.1.2", "RF.1.3", "RF.1.4"],
  },
  {
    domain: "Writing",
    cluster: "Text Types and Purposes",
    standards: ["W.1.1", "W.1.2", "W.1.3"],
  },
] as const;

export function buildDemoQuestionBank(grade: number, subject: Subject): PrepdogQuestion[] {
  if (grade !== 1) {
    return [];
  }

  return subject === "math" ? buildMathDemoQuestions() : buildElaDemoQuestions();
}

export function extractGradePagePools(html: string, grade: number, subjectFilter?: Subject): QuestionPool[] {
  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ");
  const currentGradeToken = `${grade}st`.replace("1stst", "1st");
  if (!bodyText.includes(currentGradeToken) && grade === 1 && !bodyText.includes("1st Grade")) {
    return [];
  }

  const links = $("a")
    .toArray()
    .map((element) => ({
      href: $(element).attr("href") ?? "",
      text: $(element).text().replace(/\s+/g, " ").trim(),
      parentText: $(element).parent().text().replace(/\s+/g, " ").trim(),
    }))
    .filter(
      (link) =>
        /^Test\s+\d+$/i.test(link.text) &&
        /\/\d+(st|nd|rd|th)\//.test(link.href) &&
        isExpectedGradeSourceUrl(link.href, grade),
    );

  if (links.length === 0) {
    return extractPoolsFromSameGradeHtmlLinks($, grade, subjectFilter);
  }

  let lastMathDomain: string = MATH_DOMAINS[0].domain;
  let lastMathCluster: string = MATH_DOMAINS[0].cluster;
  let lastElaDomain: string = ELA_DOMAINS[0].domain;
  let lastElaCluster: string = ELA_DOMAINS[0].cluster;

  const pools = links.flatMap((link) => {
    const line = link.parentText;
    const subject = inferSubject(link.href, line);
    if (subjectFilter && subject !== subjectFilter) {
      return [];
    }

    const domain = subject === "math" ? inferMathDomain(line) ?? lastMathDomain : inferElaDomain(line) ?? lastElaDomain;
    const cluster = subject === "math" ? inferMathCluster(line) ?? lastMathCluster : inferElaCluster(line) ?? lastElaCluster;
    const hrefDomain = inferDomainFromHref(link.href);
    const hrefCluster = inferClusterFromHref(link.href);
    const resolvedDomain = subject === "math" ? hrefDomain ?? domain : domain;
    const resolvedCluster = subject === "math" ? hrefCluster ?? cluster : cluster;

    if (subject === "math") {
      lastMathDomain = resolvedDomain;
      lastMathCluster = resolvedCluster;
    } else {
      lastElaDomain = resolvedDomain;
      lastElaCluster = resolvedCluster;
    }

    const testNumber = Number(link.text.match(/(\d+)/)?.[1] ?? 0);
    const standardCode = extractStandardCode(line) ?? deriveStandardCode(subject, resolvedDomain, testNumber, link.href);
    const title = extractTitle(line, standardCode) ?? `${resolvedDomain} Test ${testNumber}`;

    return [{
      id: `${grade}-${subject}-${slugify(resolvedDomain)}-${testNumber}`,
      grade,
      subject,
      domain: resolvedDomain,
      cluster: resolvedCluster,
      standardCode,
      title,
      testNumber,
      sourceUrl: new URL(link.href, "https://www.prepdog.org").toString(),
    } satisfies QuestionPool];
  });

  return dedupeBySourceUrl(pools);
}

function extractPoolsFromSameGradeHtmlLinks($: cheerio.CheerioAPI, grade: number, subjectFilter?: Subject) {
  const links = $("a")
    .toArray()
    .map((element) => ({
      href: $(element).attr("href") ?? "",
      text: $(element).text().replace(/\s+/g, " ").trim(),
      title: $(element).attr("title")?.replace(/\s+/g, " ").trim() ?? "",
    }))
    .filter((link) => isImportableSameGradeHtmlLink(link.href, grade));

  const pools = links.flatMap((link, index) => {
    const sourceUrl = new URL(link.href, "https://www.prepdog.org").toString();
    const sourceText = `${link.text} ${link.title}`.trim();
    const subject = inferSubject(sourceUrl, sourceText);
    if (subjectFilter && subject !== subjectFilter) {
      return [];
    }

    const domain = inferDomainFromHref(sourceUrl, grade, subject) ?? (subject === "math" ? "Operations & Algebraic Thinking" : "Language");
    const cluster = inferClusterFromHref(sourceUrl, grade, subject) ?? domain;
    const standardCode = extractStandardCode(sourceText) ?? deriveStandardCode(subject, domain, index + 1, sourceUrl);
    const title = extractTitleFromHref(sourceUrl) ?? (sourceText || `${domain} practice ${index + 1}`);

    return [{
      id: `${grade}-${subject}-${slugify(domain)}-${slugify(sourceUrl)}`,
      grade,
      subject,
      domain,
      cluster,
      standardCode,
      title,
      testNumber: index + 1,
      sourceUrl,
    } satisfies QuestionPool];
  });

  return dedupeBySourceUrl(pools);
}

function isExpectedGradeSourceUrl(href: string, grade: number) {
  try {
    const pathname = new URL(href, "https://www.prepdog.org").pathname.toLowerCase();
    return pathname.includes(`/${ordinalFolder(grade).toLowerCase()}/`);
  } catch {
    return false;
  }
}

function isImportableSameGradeHtmlLink(href: string, grade: number) {
  try {
    const pathname = new URL(href, "https://www.prepdog.org").pathname.toLowerCase();
    return (
      pathname.endsWith(".html") &&
      pathname.includes(`/${ordinalFolder(grade).toLowerCase()}/`) &&
      !pathname.endsWith(`/${grade}-common.html`) &&
      !pathname.includes("_files/")
    );
  } catch {
    return false;
  }
}

function dedupeBySourceUrl(pools: QuestionPool[]) {
  const seen = new Set<string>();

  return pools.filter((pool) => {
    if (seen.has(pool.sourceUrl)) {
      return false;
    }

    seen.add(pool.sourceUrl);
    return true;
  });
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

export function parsePrepDogTestPage(html: string, pool: QuestionPool): ImportedQuestionPool {
  const answerMap = parseScriptArray(html, "ansMap");
  const questionBlocks = parseScriptArray(html, "questionText");

  const questions = questionBlocks.flatMap((rawQuestion, index) => {
    const choiceEntries = extractChoicesFromHtml(rawQuestion, pool.sourceUrl);
    const prompt = normalizePrompt(rawQuestion);
    const promptWithoutChoices = choiceEntries.length > 0
      ? extractPromptFromHtml(rawQuestion)
      : stripChoicesFromPrompt(prompt);
    const imageUrls = choiceEntries.length > 0
      ? extractPromptImageUrls(rawQuestion, pool.sourceUrl)
      : extractImageUrls(rawQuestion, pool.sourceUrl);
    const resolvedChoices = choiceEntries.length > 0 ? choiceEntries : extractChoices(prompt);
    const correctChoiceId = (answerMap[index] ?? "A").trim().toUpperCase();
    const difficultyLevel = mapDifficultyLevel(pool.testNumber, index);

    const question = {
      id: `${pool.id}-q${index + 1}`,
      grade: pool.grade,
      subject: pool.subject,
      domain: pool.domain,
      cluster: pool.cluster,
      standardCode: pool.standardCode,
      prompt: promptWithoutChoices,
      imageUrls,
      choices: resolvedChoices,
      correctChoiceId,
      difficultyLevel,
      difficultyBand: difficultyBandFromLevel(difficultyLevel),
      speechText: `<speak>
        ${promptWithoutChoices}
        ${resolvedChoices.map((choice) => `Choice ${choice.id}: ${choice.text} <break time="1s"/>`).join(" ")}
      </speak>`,
      sourceUrl: pool.sourceUrl,
      sourceQuestionIndex: index + 1,
    } satisfies PrepdogQuestion;

    return isValidImportedQuestion(question) ? [question] : [];
  });

  return { pool, questions };
}

function buildMathDemoQuestions(): PrepdogQuestion[] {
  return Array.from({ length: 48 }, (_, index) => {
    const domainMeta = MATH_DOMAINS[index % MATH_DOMAINS.length];
    const difficultyLevel = (index % 8) + 2;
    const a = 4 + (index % 9);
    const b = 2 + ((index * 3) % 8);
    const isSubtraction = index % 3 === 0;
    const answer = isSubtraction ? a + 10 - b : a + b;
    const prompt = isSubtraction
      ? `Milo had ${a + 10} stickers. He gave away ${b}. How many stickers does he have now?`
      : `Lena had ${a} marbles. She found ${b} more. How many marbles does she have now?`;

    const choices = buildNumberChoices(answer, index);
    return {
      id: `demo-math-${index + 1}`,
      grade: 1,
      subject: "math",
      domain: domainMeta.domain,
      cluster: domainMeta.cluster,
      standardCode: domainMeta.standards[index % domainMeta.standards.length],
      prompt,
      choices,
      correctChoiceId: choices[0].id,
      difficultyLevel,
      difficultyBand: difficultyBandFromLevel(difficultyLevel),
      speechText: `<speak>
        ${prompt}
        ${choices.map((choice) => `Choice ${choice.id}: ${choice.text} <break time="1s"/>`).join(" ")},
      </speak>`,
    };
  });
}

function buildElaDemoQuestions(): PrepdogQuestion[] {
  const templates = [
    {
      prompt: (index: number) => `Which sentence uses the correct end punctuation for question ${index + 1}?`,
      choices: ["Can we play now?", "Can we play now.", "Can we play now!", "Can we play now,"],
      correct: "A",
    },
    {
      prompt: () => "Which word is a proper noun?",
      choices: ["city", "school", "Maya", "dog"],
      correct: "C",
    },
    {
      prompt: () => "Which word best completes the sentence: The ducks ____ in the pond.",
      choices: ["swims", "swim", "swimming", "swamly"],
      correct: "B",
    },
    {
      prompt: () => "Choose the word that means almost the same as happy.",
      choices: ["sad", "glad", "slow", "dark"],
      correct: "B",
    },
  ] as const;

  return Array.from({ length: 48 }, (_, index) => {
    const domainMeta = ELA_DOMAINS[index % ELA_DOMAINS.length];
    const template = templates[index % templates.length];
    const difficultyLevel = (index % 8) + 2;
    const choices = template.choices.map((text, choiceIndex) => ({
      id: String.fromCharCode(65 + choiceIndex),
      text,
    }));

    return {
      id: `demo-ela-${index + 1}`,
      grade: 1,
      subject: "ela",
      domain: domainMeta.domain,
      cluster: domainMeta.cluster,
      standardCode: domainMeta.standards[index % domainMeta.standards.length],
      prompt: template.prompt(index),
      choices,
      correctChoiceId: template.correct,
      difficultyLevel,
      difficultyBand: difficultyBandFromLevel(difficultyLevel),
      speechText: `${template.prompt(index)} ${choices.map((choice) => `${choice.id}. ${choice.text}`).join(" ")}`,
    };
  });
}

function buildNumberChoices(answer: number, index: number): QuestionChoice[] {
  const values = [answer, answer + 1 + (index % 2), answer - 1 || answer + 3, answer + 4];
  return values.map((value, optionIndex) => ({
    id: String.fromCharCode(65 + optionIndex),
    text: String(value),
  }));
}

function parseScriptArray(html: string, variableName: string) {
  const entries = [...html.matchAll(new RegExp(`${variableName}\\[(\\d+)\\]\\s*=\\s*'([\\s\\S]*?)';`, "g"))];
  return entries
    .sort((left, right) => Number(left[1]) - Number(right[1]))
    .map((match) =>
      match[2]
        .replace(/'\s*\+\s*'/g, "")
        .replace(/\\'/g, "'")
        .replace(/\\r?\\n/g, " "),
    );
}

function normalizePrompt(rawQuestion: string) {
  return decode(rawQuestion)
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPromptFromHtml(rawQuestion: string) {
  const { $, root } = loadQuestionHtml(rawQuestion);
  stripChoiceMarkup($, root);
  return normalizePrompt(root.html() ?? "");
}

function extractImageUrls(rawQuestion: string, sourceUrl: string) {
  const decodedQuestion = decode(rawQuestion);
  const imageMatches = [...decodedQuestion.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)];

  const imageUrls = imageMatches.flatMap((match) => {
    try {
      return [new URL(match[1], sourceUrl).toString()];
    } catch {
      return [];
    }
  });

  return imageUrls.length > 0 ? [...new Set(imageUrls)] : undefined;
}

function extractPromptImageUrls(rawQuestion: string, sourceUrl: string) {
  const { $, root } = loadQuestionHtml(rawQuestion);
  stripChoiceMarkup($, root);
  const imageUrls = root.find("img")
    .toArray()
    .flatMap((element) => {
      try {
        const src = $(element).attr("src");
        return src ? [new URL(src, sourceUrl).toString()] : [];
      } catch {
        return [];
      }
    });

  return imageUrls.length > 0 ? [...new Set(imageUrls)] : undefined;
}

function extractChoicesFromHtml(rawQuestion: string, sourceUrl: string): QuestionChoice[] {
  const { $, root } = loadQuestionHtml(rawQuestion);
  const choices = root.find(".choice")
    .toArray()
    .flatMap((element) => {
      const idMatch = $(element).text().match(/([A-Da-d])/);
      if (!idMatch) {
        return [];
      }

      const id = idMatch[1].toUpperCase();
      const choiceCell = $(element).closest("td").next("td");
      const text = choiceCell.text().replace(/\s+/g, " ").trim();
      const imageUrl = choiceCell.find("img").toArray().flatMap((image) => {
        try {
          const src = $(image).attr("src");
          return src ? [new URL(src, sourceUrl).toString()] : [];
        } catch {
          return [];
        }
      })[0];

      if (!text && !imageUrl) {
        return [];
      }

      return [{
        id,
        text: text || `Image option ${id}`,
        imageUrl,
      } satisfies QuestionChoice];
    });

  const uniqueChoices = new Map<string, QuestionChoice>();
  for (const choice of choices) {
    if (!uniqueChoices.has(choice.id)) {
      uniqueChoices.set(choice.id, choice);
    }
  }

  return [...uniqueChoices.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function loadQuestionHtml(rawQuestion: string) {
  const decodedQuestion = decode(rawQuestion);
  const $ = cheerio.load(`<div data-question-root="true">${decodedQuestion}</div>`);
  const root = $("[data-question-root='true']");
  return { $, root };
}

function stripChoiceMarkup($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>) {
  root.find(".choice").each((_, element) => {
    const table = $(element).closest("table");
    if (table.length > 0) {
      table.remove();
      return;
    }

    $(element).remove();
  });
}

function extractChoices(prompt: string): QuestionChoice[] {
  const choicePattern = /([A-Da-d])\.\s*([\s\S]*?)(?=\s+[A-Da-d]\.\s*|$)/g;
  const matches = [...prompt.matchAll(choicePattern)];

  if (matches.length === 0) {
    return ["A", "B", "C", "D"].map((id) => ({ id, text: id }));
  }

  return matches.map((match) => ({
    id: match[1].toUpperCase(),
    text: match[2].trim(),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function stripChoicesFromPrompt(prompt: string) {
  return prompt.replace(/\s+[A-Da-d]\.\s*[\s\S]*?(?=\s+[A-Da-d]\.\s*|$)/g, "").trim();
}

function mapDifficultyLevel(testNumber: number, questionIndex: number) {
  const baseline = Math.min(8, Math.max(2, 2 + Math.floor((testNumber - 1) / 2)));
  return Math.min(10, baseline + (questionIndex % 3));
}

export function difficultyBandFromLevel(level: number): DifficultyBand {
  if (level >= 7) {
    return "high";
  }

  if (level <= 4) {
    return "low";
  }

  return "medium";
}

function inferSubject(href: string, line: string): Subject {
  return /\d+(oa|nbt|md|g|nf)|math_core|ccm/i.test(href) || /Operations|Geometry|Base Ten|Measurement|Fractions/i.test(line)
    ? "math"
    : "ela";
}

function inferMathDomain(line: string) {
  return MATH_DOMAINS.find((entry) => line.includes(entry.domain))?.domain;
}

function inferMathCluster(line: string) {
  return MATH_DOMAINS.find((entry) => line.includes(entry.cluster))?.cluster;
}

function inferElaDomain(line: string) {
  return ELA_DOMAINS.find((entry) => line.includes(entry.domain))?.domain;
}

function inferElaCluster(line: string) {
  return ELA_DOMAINS.find((entry) => line.includes(entry.cluster))?.cluster;
}

function extractStandardCode(line: string) {
  return line.match(/([A-Z]+\.?\d+(?:\.\d+)?(?:\.[A-Z])?)/)?.[1];
}

function extractTitle(line: string, standardCode: string) {
  const title = line.replace(/Test\s+\d+/i, "").replace(standardCode, "").trim();
  return title || undefined;
}

function deriveStandardCode(subject: Subject, domain: string, testNumber: number, href: string) {
  const normalizedHref = href.toLowerCase();

  if (subject === "math") {
    const mathCode = normalizedHref.match(/(?:^|[^a-z])(oa|nbt|md|g|nf)(?:[^a-z]|$)/i)?.[1]?.toUpperCase();
    if (mathCode) {
      return `${extractGradeFromHref(normalizedHref) ?? 1}.${mathCode}.${testNumber}`;
    }
  }

  const grade = extractGradeFromHref(normalizedHref) ?? 1;
  const prefix = subject === "math" ? `${grade}.MATH` : `${grade}.ELA`;
  return `${prefix}.${slugify(domain).toUpperCase()}.${testNumber}`;
}

function isValidImportedQuestion(question: PrepdogQuestion) {
  return (
    question.prompt.length > 0 &&
    question.choices.length >= 3 &&
    question.choices.every((choice) => Boolean(choice.imageUrl) || (choice.text.length > 0 && choice.text !== choice.id)) &&
    question.choices.some((choice) => choice.id === question.correctChoiceId)
  );
}

function inferDomainFromHref(href: string, grade?: number, subject?: Subject) {
  if (/oa/i.test(href)) {
    return "Operations & Algebraic Thinking";
  }

  if (/nbt/i.test(href)) {
    return "Number & Operations in Base Ten";
  }

  if (/md/i.test(href)) {
    return "Measurement & Data";
  }

  if (/(?:^|[^a-z])g(?:[^a-z]|$)|geometry/i.test(href)) {
    return "Geometry";
  }

  if (/nf|fractions?/i.test(href)) {
    return "Number & Operations - Fractions";
  }

  if (/\/(l\.|language)|language/i.test(href)) {
    return "Language";
  }

  if (/\/(rf\.)|foundational/i.test(href)) {
    return "Foundational Skills";
  }

  if (/\/(ri\.)|informational/i.test(href)) {
    return "Reading: Informational Text";
  }

  if (/\/(rl\.)|literature/i.test(href)) {
    return "Reading: Literature";
  }

  if (/\/(w\.)|writing/i.test(href)) {
    return "Writing";
  }

  if (subject === "ela") {
    return "Language";
  }

  if (subject === "math") {
    return grade && grade >= 3 ? "Operations & Algebraic Thinking" : "Measurement & Data";
  }
}

function inferClusterFromHref(href: string, _grade?: number, subject?: Subject) {
  if (/oa/i.test(href)) {
    return "Represent and solve problems involving addition and subtraction";
  }

  if (/nbt/i.test(href)) {
    return "Understand place value";
  }

  if (/md/i.test(href)) {
    return "Solve problems involving measurement and data";
  }

  if (/(?:^|[^a-z])g(?:[^a-z]|$)|geometry/i.test(href)) {
    return "Reason with shapes and their attributes";
  }

  if (/nf|fractions?/i.test(href)) {
    return "Develop understanding of fractions as numbers";
  }

  if (/\/(l\.|language)|language/i.test(href)) {
    return "Conventions of Standard English";
  }

  if (/\/(rf\.)|foundational/i.test(href)) {
    return "Phonics and Word Recognition";
  }

  if (/\/(ri\.)|informational/i.test(href) || /\/(rl\.)|literature/i.test(href)) {
    return "Key Ideas and Details";
  }

  if (/\/(w\.)|writing/i.test(href)) {
    return "Text Types and Purposes";
  }

  if (subject === "ela") {
    return "Conventions of Standard English";
  }
}

function extractGradeFromHref(href: string) {
  const match = href.match(/\/(\d)(?:st|nd|rd|th)\//i);
  return match ? Number(match[1]) : undefined;
}

function extractTitleFromHref(href: string) {
  const fileName = href.split("/").pop()?.replace(/\.html$/i, "");
  if (!fileName) {
    return undefined;
  }

  return decode(fileName)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
