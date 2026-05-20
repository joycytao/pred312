import type { Metadata } from "next";
import { Suspense } from "react";

import { ChineseClientPage } from "./chinese-client";

export const metadata: Metadata = {
  title: "識字小達人 | PrepDog Chinese",
  description: "Scoped Chinese literacy practice under /chinese with student and admin modes.",
};

export default function ChinesePage() {
  return (
    <Suspense fallback={<ChinesePageFallback />}>
      <ChineseClientPage />
    </Suspense>
  );
}

function ChinesePageFallback() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f7efe1_0%,#fff9ef_32%,#dce9d6_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl rounded-[2.5rem] border border-slate-900/10 bg-white/80 px-8 py-16 shadow-[0_24px_80px_rgba(82,63,22,0.12)]">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-700">Scoped Under /chinese</p>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl leading-none">識字小達人</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">正在準備中文識字練習畫面...</p>
      </div>
    </main>
  );
}
