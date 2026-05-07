import { decode } from "html-entities";
import * as cheerio from "cheerio";

export type Subject = "math" | "ela";
export type DifficultyBand = "low" | "medium" | "high";

export type QuestionChoice = {
  id: string;
  text: string;
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
    .filter((link) => /^Test\s+\d+$/i.test(link.text) && /\/\d+(st|nd|rd|th)\//.test(link.href));

  let lastMathDomain: string = MATH_DOMAINS[0].domain;
  let lastMathCluster: string = MATH_DOMAINS[0].cluster;
  let lastElaDomain: string = ELA_DOMAINS[0].domain;
  let lastElaCluster: string = ELA_DOMAINS[0].cluster;

  return links.flatMap((link) => {
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
}

export function parsePrepDogTestPage(html: string, pool: QuestionPool): ImportedQuestionPool {
  const answerMap = parseScriptArray(html, "ansMap");
  const questionBlocks = parseScriptArray(html, "questionText");

  const questions = questionBlocks.flatMap((rawQuestion, index) => {
    const prompt = normalizePrompt(rawQuestion);
    const imageUrls = extractImageUrls(rawQuestion, pool.sourceUrl);
    const choiceEntries = extractChoices(prompt);
    const promptWithoutChoices = stripChoicesFromPrompt(prompt);
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
      choices: choiceEntries,
      correctChoiceId,
      difficultyLevel,
      difficultyBand: difficultyBandFromLevel(difficultyLevel),
      speechText: `${promptWithoutChoices} ${choiceEntries.map((choice) => `${choice.id}. ${choice.text}`).join(" ")}`,
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
      speechText: `${prompt} ${choices.map((choice) => `${choice.id}. ${choice.text}`).join(" ")}`,
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
  return /\d+(oa|nbt|md|g)/i.test(href) || /Operations|Geometry|Base Ten|Measurement/i.test(line)
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
  if (subject === "math") {
    const mathCode = href.match(/1(oa|nbt|md|g)/i)?.[1]?.toUpperCase();
    if (mathCode) {
      return `1.${mathCode}.${testNumber}`;
    }
  }

  const prefix = subject === "math" ? "1.MATH" : "1.ELA";
  return `${prefix}.${slugify(domain).toUpperCase()}.${testNumber}`;
}

function isValidImportedQuestion(question: PrepdogQuestion) {
  return (
    question.prompt.length > 0 &&
    question.choices.length >= 4 &&
    question.choices.every((choice) => choice.text.length > 2 && choice.text !== choice.id) &&
    question.choices.some((choice) => choice.id === question.correctChoiceId)
  );
}

function inferDomainFromHref(href: string) {
  if (/1oa/i.test(href)) {
    return "Operations & Algebraic Thinking";
  }

  if (/1nbt/i.test(href)) {
    return "Number & Operations in Base Ten";
  }

  if (/1md/i.test(href)) {
    return "Measurement & Data";
  }

  if (/1g/i.test(href)) {
    return "Geometry";
  }
}

function inferClusterFromHref(href: string) {
  if (/1oa/i.test(href)) {
    return "Represent and solve problems involving addition and subtraction";
  }

  if (/1nbt/i.test(href)) {
    return "Understand place value";
  }

  if (/1md/i.test(href)) {
    return "Tell and write time";
  }

  if (/1g/i.test(href)) {
    return "Reason with shapes and their attributes";
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
