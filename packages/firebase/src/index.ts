import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getApp, getApps as getClientApps, initializeApp as initializeClientApp, type FirebaseOptions } from "firebase/app";

import type { ImportedQuestionPool, PrepdogQuestion, Subject } from "@prepdog/content";
import { buildDemoQuestionBank } from "@prepdog/content";

export function isFirebaseAdminConfigured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

export function isFirebaseClientConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
}

export function getFirebaseClientConfig(): FirebaseOptions | null {
  if (!isFirebaseClientConfigured()) {
    return null;
  }

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

export function getFirebaseClientApp() {
  const config = getFirebaseClientConfig();
  if (!config) {
    return null;
  }

  return getClientApps().length > 0 ? getApp() : initializeClientApp(config);
}

export function getAdminFirestore() {
  if (!isFirebaseAdminConfigured()) {
    return null;
  }

  const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim();

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          }),
        });

  return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}

export async function loadQuestionsForGradeAndSubject(input: {
  grade: number;
  subject: Subject;
}) {
  const firestore = getAdminFirestore();
  if (!firestore) {
    return buildDemoQuestionBank(input.grade, input.subject);
  }

  const snapshot = await firestore
    .collection("questions")
    .where("grade", "==", input.grade)
    .where("subject", "==", input.subject)
    .where("isActive", "==", true)
    .limit(120)
    .get();

  if (snapshot.empty) {
    return buildDemoQuestionBank(input.grade, input.subject);
  }

  return snapshot.docs.map((document) => document.data() as PrepdogQuestion);
}

export async function upsertImportedQuestionPool(importedPool: ImportedQuestionPool) {
  const firestore = getAdminFirestore();
  if (!firestore) {
    throw new Error("Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.");
  }

  const batch = firestore.batch();
  const poolRef = firestore.collection("questionPools").doc(importedPool.pool.id);
  batch.set(poolRef, {
    ...importedPool.pool,
    questionCount: importedPool.questions.length,
    importVersion: "v1",
    createdAt: new Date().toISOString(),
    source: "prepdog",
  });

  for (const question of importedPool.questions) {
    const questionRef = firestore.collection("questions").doc(question.id);
    batch.set(questionRef, {
      ...question,
      poolId: importedPool.pool.id,
      tags: [importedPool.pool.domain, importedPool.pool.cluster],
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  }

  await batch.commit();
}
