import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import type { ImportedQuestionPool, Subject } from "@prepdog/content";

type FilterArgs = {
  grade?: number;
  subject?: Subject;
};

type FirestoreDocumentReference = {
  id: string;
  name: string;
};

const FIREBASE_TOOLS_CONFIG_PATH = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const GOOGLE_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const require = createRequire(import.meta.url);

export async function deleteImportedContent(args: FilterArgs) {
  const [poolDocuments, questionDocuments] = await Promise.all([
    listCollectionDocuments("questionPools", args),
    listCollectionDocuments("questions", args),
  ]);

  for (const document of [...poolDocuments, ...questionDocuments]) {
    await firestoreRestRequest(documentUrlFromName(document.name), { method: "DELETE" });
  }

  return {
    poolCount: poolDocuments.length,
    questionCount: questionDocuments.length,
  };
}

export async function countImportedContent(args: FilterArgs) {
  const [poolDocuments, questionDocuments] = await Promise.all([
    listCollectionDocuments("questionPools", args),
    listCollectionDocuments("questions", args),
  ]);

  return {
    poolCount: poolDocuments.length,
    questionCount: questionDocuments.length,
  };
}

export async function upsertImportedQuestionPoolViaRest(importedPool: ImportedQuestionPool) {
  const existingQuestionDocuments = await listQuestionDocumentsByPoolId(importedPool.pool.id);
  const nextQuestionIds = new Set(importedPool.questions.map((question) => question.id));
  const staleQuestionDocuments = existingQuestionDocuments.filter((document) => !nextQuestionIds.has(document.id));
  const writes = [
    ...staleQuestionDocuments.map((document) => ({
      delete: document.name,
    })),
    {
      update: {
        name: documentResourceName("questionPools", importedPool.pool.id),
        fields: serializeFields({
          ...importedPool.pool,
          questionCount: importedPool.questions.length,
          importVersion: "v1",
          createdAt: new Date().toISOString(),
          source: "prepdog",
        }),
      },
    },
    ...importedPool.questions.map((question) => ({
      update: {
        name: documentResourceName("questions", question.id),
        fields: serializeFields({
          ...stripUndefinedFields(question),
          poolId: importedPool.pool.id,
          tags: [importedPool.pool.domain, importedPool.pool.cluster],
          isActive: true,
          createdAt: new Date().toISOString(),
        }),
      },
    })),
  ];

  await firestoreRestRequest(`${documentsBaseUrl()}:commit`, {
    method: "POST",
    body: JSON.stringify({ writes }),
  });
}

export function selectStaleQuestionDocuments(
  existingQuestionDocuments: FirestoreDocumentReference[],
  nextQuestionIds: string[],
) {
  const nextQuestionIdSet = new Set(nextQuestionIds);
  return existingQuestionDocuments.filter((document) => !nextQuestionIdSet.has(document.id));
}

function documentResourceName(collectionId: string, documentId: string) {
  return `projects/${resolveProjectId()}/databases/${resolveDatabaseId()}/documents/${collectionId}/${encodeURIComponent(documentId)}`;
}

function documentUrlFromName(name: string) {
  return `https://firestore.googleapis.com/v1/${name}`;
}

async function listCollectionDocuments(collectionId: string, args: FilterArgs) {
  const where = buildWhereFilter(args);
  const response = await firestoreRestRequest(`${documentsBaseUrl()}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        ...(where ? { where } : {}),
      },
    }),
  });

  const payload = (await response.json()) as Array<{ document?: { name: string } }>;

  return payload.flatMap((entry) => {
    if (!entry.document?.name) {
      return [];
    }

    return [{
      name: entry.document.name,
      id: entry.document.name.split("/").pop() ?? entry.document.name,
    } satisfies FirestoreDocumentReference];
  });
}

async function listQuestionDocumentsByPoolId(poolId: string) {
  const response = await firestoreRestRequest(`${documentsBaseUrl()}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "questions" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "poolId" },
            op: "EQUAL",
            value: serializeValue(poolId),
          },
        },
      },
    }),
  });

  const payload = (await response.json()) as Array<{ document?: { name: string } }>;

  return payload.flatMap((entry) => {
    if (!entry.document?.name) {
      return [];
    }

    return [{
      name: entry.document.name,
      id: entry.document.name.split("/").pop() ?? entry.document.name,
    } satisfies FirestoreDocumentReference];
  });
}

function buildWhereFilter(args: FilterArgs) {
  const filters = [
    typeof args.grade === "number"
      ? {
          fieldFilter: {
            field: { fieldPath: "grade" },
            op: "EQUAL",
            value: serializeValue(args.grade),
          },
        }
      : null,
    args.subject
      ? {
          fieldFilter: {
            field: { fieldPath: "subject" },
            op: "EQUAL",
            value: serializeValue(args.subject),
          },
        }
      : null,
  ].filter((value): value is NonNullable<typeof value> => value !== null);

  if (filters.length === 0) {
    return undefined;
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return {
    compositeFilter: {
      op: "AND",
      filters,
    },
  };
}

function documentsBaseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${resolveProjectId()}/databases/${resolveDatabaseId()}/documents`;
}

function resolveProjectId() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (projectId) {
    return projectId;
  }

  const firebasercPath = path.join(process.cwd(), ".firebaserc");
  if (fs.existsSync(firebasercPath)) {
    const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, "utf8")) as { projects?: { default?: string } };
    if (firebaserc.projects?.default) {
      return firebaserc.projects.default;
    }
  }

  throw new Error("Unable to resolve Firebase project ID. Set FIREBASE_PROJECT_ID or configure .firebaserc.");
}

function resolveDatabaseId() {
  return process.env.FIRESTORE_DATABASE_ID?.trim() || "(default)";
}

async function firestoreRestRequest(target: string, init: RequestInit) {
  const accessToken = await readFirebaseAccessToken();
  const response = await fetch(target, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Firestore REST request failed (${response.status}): ${await response.text()}`);
  }

  return response;
}

async function readFirebaseAccessToken() {
  if (!fs.existsSync(FIREBASE_TOOLS_CONFIG_PATH)) {
    throw new Error("Firebase CLI credentials were not found. Run `firebase login` first.");
  }

  const config = JSON.parse(fs.readFileSync(FIREBASE_TOOLS_CONFIG_PATH, "utf8")) as {
    tokens?: { access_token?: string; refresh_token?: string };
  };
  const refreshToken = config.tokens?.refresh_token;

  if (refreshToken) {
    const authModule = require(resolveFirebaseToolsAuthModulePath()) as {
      getAccessToken: (token: string, scopes: string[]) => Promise<{ access_token?: string }>;
    };
    const refreshed = await authModule.getAccessToken(refreshToken, [GOOGLE_CLOUD_PLATFORM_SCOPE]);
    if (refreshed.access_token) {
      return refreshed.access_token;
    }
  }

  const accessToken = config.tokens?.access_token;

  if (!accessToken) {
    throw new Error("Firebase CLI access token is unavailable. Run `firebase login` first.");
  }

  return accessToken;
}

function resolveFirebaseToolsAuthModulePath() {
  const firebaseBinary = spawnSync("which", ["firebase"], { encoding: "utf8" }).stdout.trim();
  if (!firebaseBinary) {
    throw new Error("Firebase CLI is not installed or not available on PATH.");
  }

  const realFirebaseBinary = fs.realpathSync(firebaseBinary);
  return path.resolve(path.dirname(realFirebaseBinary), "..", "auth.js");
}

function stripUndefinedFields<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function serializeFields(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) =>
      entryValue === undefined ? [] : [[key, serializeValue(entryValue)]],
    ),
  );
}

function serializeValue(value: unknown): Record<string, unknown> {
  if (value === null) {
    return { nullValue: null };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entryValue) => serializeValue(entryValue)),
      },
    };
  }

  return {
    mapValue: {
      fields: serializeFields(value as Record<string, unknown>),
    },
  };
}