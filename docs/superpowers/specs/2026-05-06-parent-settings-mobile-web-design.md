# Parent Settings And Mobile Web Design

Date: 2026-05-06
Status: Drafted from approved chat direction, pending user review
Project root: /Users/jtao/Documents/Projects/Eli/prepdog

## Goal

Extend PrepDog parent settings so the app works as one responsive web product across desktop browsers, iPhone browsers, and iPad browsers, while keeping parent data consistent across devices.

This design covers:

- parent grade selection beyond grade 1
- parent account requirements for cross-device use
- responsive mobile web behavior for parent and student flows
- the boundary between demo mode and signed-in synced mode

## Problem Statement

The current app can run locally and supports a parent settings panel, but three gaps remain:

1. grade selection is hardcoded to grade 1 in the UI
2. cross-device use is not reliable because local storage is still part of the main state flow
3. mobile web support is incidental rather than explicitly designed

The importer already supports `--grade`, and the question API already accepts a `grade` parameter, so the missing work is mainly in product behavior, parent settings state management, and responsive interaction design.

## Product Decisions

### Single Responsive Web App

PrepDog will remain one Next.js web app that supports:

- desktop web browsers
- iPhone web browsers
- iPad web browsers

No native mobile app work is required in this phase.

### Parent Account Requirement

Parent accounts are required for true cross-device behavior.

Reasoning:

- without identity, there is no safe way to know that the same parent is opening the app on multiple devices
- grade preference, saved results, and future student profiles must be tied to a stable parent record
- cross-device syncing is a backend data problem, not a local UI problem

### Demo Mode Remains Available

The app should still work without sign-in as a demo or local-only experience.

In demo mode:

- question flow works
- grade can be stored locally if needed
- saved results stay local to the current device

In signed-in mode:

- parent settings become the source of truth
- grade preference syncs across devices
- saved results sync across devices

### Grade Strategy

The importer remains grade-driven.

Expected behavior:

- `pnpm import:prepdog --grade 1` imports grade 1 content
- `pnpm import:prepdog --grade 2` imports grade 2 content
- `pnpm import:prepdog --grade 3` imports grade 3 content

The parent settings UI must allow selecting from supported grades, and the selected grade must drive question loading.

## Parent Settings Behavior

The parent settings panel should include:

- parent account status
- sign in / create account / sign out actions
- grade selector
- saved results summary

Behavior rules:

1. if signed out, show demo-mode messaging and allow local-only use
2. if signed in, load the parent profile from Firestore
3. if the parent changes grade, persist it to the parent profile
4. when a student starts a test, the selected grade determines the `grade` query sent to the questions API

## Data Model Decisions

### Parent Profile

Use `users/{userId}` as the parent profile document.

Required fields for this phase:

- `email`
- `selectedDefaultGrade`
- `updatedAt`

### Test Sessions

Use `testSessions/{sessionId}` as the synced results store.

Required fields for this phase:

- `userId`
- `grade`
- `subject`
- `status`
- `startedAt`
- `finishedAt`
- `ritLikeScore`
- `correctCount`
- `incorrectCount`
- `questionOrder`
- `missedQuestionNumbers`

### Local Storage Role

Local storage remains a fallback only.

It should be used for:

- demo mode grade preference
- demo mode recent results

It should not be treated as the main source of truth when a parent is signed in.

## Grade Selection Flow

### Import Flow

The importer must continue to fetch the grade index page that matches the requested grade and import that grade's subject pools.

No product change is required to the importer contract beyond verifying that higher grades are actually imported and stored with the correct `grade` field.

### Runtime Flow

When a parent selects grade 2 or grade 3 in settings:

1. save the grade to the parent profile if signed in
2. save locally if in demo mode
3. when the student chooses Math or ELA, call `/api/questions?grade=<selectedGrade>&subject=<subject>`
4. if no content exists for that grade and subject, show a clear non-crashing message

## Cross-Device Sync Behavior

### Required Outcome

If a parent signs in on desktop and changes the grade, then signs in on iPhone or iPad, the same grade should be shown.

If a parent completes a test on one device, the saved result should be visible in parent settings on another device after sign-in.

### Sync Source Of Truth

For signed-in parents, Firestore is the authoritative source for:

- selected grade
- saved results

Local storage may still cache values for responsiveness, but Firestore wins on conflicts.

## Mobile Web Requirements

### Parent Settings

On iPhone widths:

- settings panel should fit the viewport width with comfortable padding
- touch targets must remain large enough for taps
- grade selector, auth buttons, and saved results should stack vertically

On iPad widths:

- settings panel can remain drawer-like or card-like, but it must not overflow the viewport
- content density can increase slightly compared with phone layout

### Student Test Flow

On phone and tablet browsers:

- question prompt must remain readable without horizontal scrolling
- answer options must remain easy to tap
- the `✅` confirm action must remain reachable and visually clear
- the `🗣️` control must remain visible near the question prompt
- no behavior should depend on hover

### Landing Page

The landing page remains the subject chooser.

On mobile web:

- Math and ELA choices must remain prominent and tappable
- the settings entry point must remain visible but not dominate the screen

## Approaches Considered

### Approach A: Local-Only Parent Settings

Pros:

- simplest implementation
- minimal backend dependency

Cons:

- fails the cross-device requirement
- causes settings and results drift between devices

Rejected.

### Approach B: Parent Account For Synced Settings, Demo Mode As Fallback

Pros:

- supports cross-device use cleanly
- preserves low-friction demo mode
- fits the current architecture with minimal conceptual churn

Cons:

- parent must sign in for synced behavior

Recommended.

### Approach C: Anonymous Sessions With Later Account Linking

Pros:

- lower initial sign-in friction

Cons:

- adds migration complexity
- complicates data ownership rules
- unnecessary for this phase

Rejected.

## Implementation Plan Shape

### Slice 1: Grade Support In Parent Settings

- replace hardcoded grade array with a supported grade list
- persist selected grade locally and to Firestore when signed in
- verify question fetches use the selected grade

### Slice 2: Signed-In Cross-Device State

- ensure signed-in parent profile loads on app start
- treat Firestore parent profile as authoritative for grade
- ensure saved sessions load consistently across devices

### Slice 3: Mobile Web Layout Refinements

- tighten parent settings drawer layout for narrow screens
- validate subject chooser, question flow, explanation modal, and results on phone and tablet widths

### Slice 4: Empty-State And Error Messaging

- if a selected grade lacks content, show a clear message
- if cloud sync fails, keep the local session usable and explain the limitation

## Testing Strategy

### Functional Checks

- import grade 1 and verify grade 1 questions load
- import grade 2 and verify grade 2 questions load
- import grade 3 and verify grade 3 questions load
- change grade in parent settings and start a new test
- sign in on one browser, change grade, then verify the same grade appears in another browser session

### Responsive Checks

Test at minimum:

- desktop width
- iPad width
- iPhone width

Verify:

- subject chooser remains usable
- settings drawer remains readable
- answer buttons remain easy to tap
- results remain readable

## Risks

- higher grades may be technically supported by importer logic but not yet populated in Firestore
- local demo mode and signed-in mode can diverge if conflict rules are not explicit
- mobile Safari layout issues may appear in the settings drawer or modal overlays if not tested directly

## Non-Goals For This Phase

- native iOS app
- child account login
- multi-student profile management beyond preserving room for it
- offline-first syncing

## Recommendation

Proceed with one responsive web app, require parent sign-in for cross-device syncing, keep demo mode as local fallback, and treat Firestore parent records as the source of truth for selected grade and saved sessions.