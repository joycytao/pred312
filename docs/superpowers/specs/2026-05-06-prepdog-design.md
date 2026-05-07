# PrepDog Design

Date: 2026-05-06
Status: Approved in chat, pending written spec review
Project root: /Users/jtao/Documents/Projects/Eli/prepdog

## Goal

Build a child-friendly adaptive assessment app called PrepDog. The first supported grade is grade 1, but the system must be designed to scale to additional grades later. The first release supports Math and English Language Arts (ELA), uses a RIT-inspired adaptive scoring model, imports question pools from PrepDog source pages, stores normalized question data in Firebase Firestore, and generates kid-friendly explanations for incorrect answers using an AI teacher agent.

## Scope Summary

- Create a monorepo-style Next.js project structure suitable for Claude/Copilot workflows.
- Provide a landing page with two choices: English Language Arts and Math.
- Provide a top-right parent settings entry point.
- Support parent login in v1.
- Support grade selection from parent settings.
- Run a 40-question adaptive test for the selected grade and subject.
- Let the child change the selected answer before pressing a green confirm button.
- Provide a speech button to read each question and its options aloud.
- On incorrect answers, use AI to generate kid-friendly explanations.
- Show a final results screen with score, fireworks, total correct, total incorrect, and missed question numbers.
- Import question pools from PrepDog grade index pages and linked test pages.
- Store normalized content in Firestore.

## Product Decisions

### Grade Strategy

- Grade 1 is the first supported grade.
- The schema, importer, and app logic must scale to future grades.
- Parent settings determine the active grade for test generation.

### App Stack And Structure

Use a balanced monorepo:

- `apps/web`: Next.js + TypeScript app
- `packages/assessment`: adaptive engine and score logic
- `packages/content`: question models, normalization, crawl helpers
- `packages/firebase`: Firebase Admin and client wrappers
- `scripts`: import and maintenance scripts
- `.claude/agents/ai-teacher-agent.md`: AI explanation contract
- `docs`: architecture and setup notes

### Scoring Model

Use a practical RIT-like approximation, not a psychometrically calibrated engine.

- Start each test at a grade-appropriate medium difficulty.
- Increase estimated ability on correct answers.
- Decrease estimated ability on incorrect answers.
- Choose subsequent questions from adjacent difficulty bands.
- Produce a final RIT-like score from the ability trace and question difficulties.
- Preserve room for future refinement without changing the entire schema.

### Accounts

- Parent login is included in v1.
- Parent users can choose grade and review saved results.
- Child-facing test flow remains simple and does not expose account complexity.

### Explanation Strategy

- AI-generated explanations are the primary explanation mechanism.
- Imported content should not assume built-in explanations exist.
- If AI is unavailable or misconfigured, the test flow must continue and show a neutral fallback message such as "Explanation is temporarily unavailable."

## User Experience

## Landing Page

The landing page shows two large subject choices:

- English Language Arts
- Math

It also includes a settings icon in the top-right corner for parent controls.

## Test Experience

Each session contains exactly 40 questions.

Each question screen includes:

- prompt text
- multiple-choice options
- a speech button (`🗣️`) to read the prompt and answer options aloud
- a visible current selection state
- a green confirm button (`✅`) that submits the answer

The child can change the selected option until the confirm button is pressed.

## Adaptive Behavior

For each answer:

- correct answers usually move the session toward a harder question
- incorrect answers usually move the session toward an easier question
- the selection algorithm should also vary domains or clusters enough to avoid over-focusing on a single narrow skill area

## Incorrect Answer Behavior

After an incorrect submission:

- the app sends the question context to the AI teacher flow
- the AI generates a kid-friendly explanation using simple language and short sentences
- the explanation should explain why the correct answer works
- the explanation should avoid harsh wording and avoid revealing the answer before submission
- if the AI call fails, show a neutral unblocking message and continue the test

## Results Screen

After the test ends:

- show the final score with celebratory fireworks
- show number correct
- show number incorrect
- show missed question numbers
- keep the results readable for both child and parent

## Content Import Source

The source site provides grade index pages such as:

- `https://www.prepdog.org/1st/1-COMMON.html`

These grade pages contain stable links to individual ELA and Math test pages. The importer should:

1. fetch the grade index page
2. extract subject, domain, cluster, standard code, test label, and test URL metadata
3. crawl linked test pages
4. parse questions, answer choices, and correct answer data
5. normalize and upsert into storage

The importer must support grade-level imports that default to both subjects. Example intended CLI behavior:

- `pnpm import:prepdog --grade 1`
- `pnpm import:prepdog --grade 1 --subject math`
- `pnpm import:prepdog --grade 1 --subject ela`

Default behavior for `--grade` only:

- import both ELA and Math for that grade

## Firestore Data Model

Avoid a single nested blob per grade and subject. Use normalized documents.

### questionPools/{poolId}

Fields:

- `grade`
- `subject`
- `source`
- `sourceUrl`
- `domain`
- `cluster`
- `standardCode`
- `testNumber`
- `title`
- `questionCount`
- `importVersion`
- `createdAt`

### questions/{questionId}

Fields:

- `poolId`
- `grade`
- `subject`
- `domain`
- `cluster`
- `standardCode`
- `prompt`
- `choices`: array of choice objects
- `correctChoiceId`
- `difficultyLevel`: numeric scale, recommended 1-10
- `difficultyBand`: `low | medium | high`
- `sourceUrl`
- `sourceQuestionIndex`
- `speechText`
- `tags`
- `isActive`
- `createdAt`

Note: knowledge level should not be stored as a global truth on the question document. Student knowledge is learner-specific and should be derived from performance.

If the implementation needs to preserve the original request for a knowledge label, it should do so in learner-specific derived records or summaries such as `low | medium | high` mastery per student and skill cluster, not on the canonical question itself.

### users/{userId}

Fields:

- parent profile data
- selected default grade
- preferences

### students/{studentId}

Fields:

- `userId`
- `displayName`
- `grade`
- `activeSubjects`

### testSessions/{sessionId}

Fields:

- `studentId`
- `grade`
- `subject`
- `status`
- `startedAt`
- `finishedAt`
- `initialAbility`
- `finalAbility`
- `ritLikeScore`
- `correctCount`
- `incorrectCount`
- `questionOrder`
- `missedQuestionNumbers`

### testResponses/{responseId}

Fields:

- `sessionId`
- `questionId`
- `questionNumber`
- `selectedChoiceId`
- `isCorrect`
- `difficultyBefore`
- `difficultyAfter`
- `abilityBefore`
- `abilityAfter`
- `explanationShown`

### Optional future derived collection: studentSkillProfiles/{profileId}

This is not required for the first coding pass, but it is the correct place for learner-specific knowledge summaries if added later.

Fields:

- `studentId`
- `grade`
- `subject`
- `domain`
- `cluster`
- `knowledgeLevel`: `low | medium | high`
- `lastUpdatedAt`

## Import Timing

The import script should not run during normal child app usage.

Recommended trigger timing:

- after Firebase is created and `.env` is configured
- manually when new content is needed or parser behavior changes
- optionally later from scheduled automation, once the parser is stable

Recommended v1 workflow:

- run manual imports from the command line
- inspect logs and Firestore results
- then use the app against imported content

## AI Teacher Agent

Create `.claude/agents/ai-teacher-agent.md` to define the explanation behavior.

The agent should receive:

- grade
- subject
- prompt
- answer choices
- correct answer
- child selected answer

The agent should respond with:

- a short, supportive explanation for why the correct answer is right
- simple wording appropriate for elementary learners
- no shaming language
- no unnecessary verbosity

## Technical Notes

- Firebase project credentials will be supplied later via `.env`.
- The project should include placeholder env examples but no real secrets.
- The app should be usable before full Firebase production hardening.
- The initial implementation should prefer a clean, testable structure over feature breadth.

## Non-Goals For V1

- full psychometric calibration
- automatic scheduled scraping from day one
- multi-grade completeness beyond grade 1 import support patterns
- non-AI explanation generation as a primary explanation source

## Implementation Direction

Recommended implementation order:

1. scaffold monorepo and app shell
2. implement shared types and adaptive engine tests
3. build landing page, settings shell, and test flow UI
4. add Firestore integration and env plumbing
5. implement importer with dry-run and JSON output first, then Firestore writes
6. wire AI teacher route and agent definition
7. add results screen and celebration effects

## Risks And Constraints

- PrepDog source HTML may be inconsistent across pages, so parser logic must be resilient.
- Firestore should store normalized content so parser corrections do not require app rewrites.
- RIT-like scoring is an approximation and should be labeled internally as such.
- AI explanations must fail gracefully without blocking session completion.
