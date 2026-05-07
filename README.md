# PrepDog

PrepDog is a monorepo-style Next.js app for adaptive grade-based practice in Math and English Language Arts.

## Workspace layout

- `apps/web`: Next.js application
- `packages/assessment`: adaptive engine and score logic
- `packages/content`: question models, demo data, and PrepDog parsers
- `packages/firebase`: Firestore loading and import persistence helpers
- `scripts/import-prepdog.ts`: grade and subject importer
- `.claude/agents/ai-teacher-agent.md`: AI explanation contract

## Commands

```bash
pnpm install
pnpm dev
pnpm test
pnpm import:prepdog --grade 1 --dry-run --limit 1
pnpm build:firebase-static
```

## Environment

Copy `.env.example` to `.env` and fill in Firebase and Gemini values when you are ready to connect real services.

`apps/web/.env.local` is for browser-safe `NEXT_PUBLIC_FIREBASE_*` values.

Root `.env` values such as `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are Firebase Admin credentials for server-side Firestore access and import jobs.

Set `NEXT_PUBLIC_STATIC_FIREBASE_HOSTING=1` only when you are building the free-plan static Hosting version. In that mode, question loading still comes from Firestore, but wrong-answer explanations use an on-device fallback instead of the secured Gemini route.

## Import behavior

`pnpm import:prepdog --grade 1` imports both Math and ELA for grade 1 by default.

Use `--subject math` or `--subject ela` to narrow the import.

## GitHub Actions Import Workflow

The repository includes `.github/workflows/import-prepdog.yml` for weekly and manual imports.

- Weekly schedule: Sundays at 06:00 UTC
- Manual trigger: run `Import PrepDog Content` from the GitHub Actions tab
- Imported content: all supported grades (1-3), both Math and ELA

Required GitHub repository secrets:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Optional GitHub repository secrets:

- `FIRESTORE_DATABASE_ID` for projects that write to a named Firestore database instead of `(default)`

The workflow runs `pnpm import:prepdog --grade <grade>` once for each supported grade and writes directly to Firestore.

If `FIRESTORE_DATABASE_ID` is unset, the importer uses the default Firestore database.

## Firebase Hosting Test Deploy

For Spark-plan testing, deploy the static export instead of App Hosting:

```bash
pnpm build:firebase-static
firebase deploy --only hosting
```

This serves the exported site from `apps/web/out` using `firebase.json`.

Static Hosting keeps Google sign-in and Firestore question loading, but it does not expose `GEMINI_API_KEY` to the browser, so explanations fall back to a local practice tip during the test deploy.
