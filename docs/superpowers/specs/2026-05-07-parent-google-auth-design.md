# Parent Google Auth Design

## Goal

Replace the current parent email/password account flow with Google-only Firebase Authentication so parents can use an existing Google account before Firebase deployment.

## Decisions

- Parent auth uses Firebase `GoogleAuthProvider` only.
- Parent settings shows a single `Continue with Google` action when signed out.
- Email/password inputs and create-account actions are removed from the default UI.
- Existing `uid`-based grade sync and saved-session sync remain unchanged.
- Desktop web uses popup sign-in first, with redirect fallback for popup-restricted browsers.

## UX

- Signed out state explains that Google sign-in enables grade and results sync across devices.
- Signed in state shows the parent email and a sign-out action.
- The old `Local demo mode` wording is replaced with clearer local-only wording.

## Firebase Console Requirements

- Enable Google provider in Firebase Authentication.
- Add the local and deployed app domains to Firebase authorized domains.
- Keep the existing client Firebase web config in `apps/web/.env.local`.

## Validation

- Update focused tests for parent auth copy.
- Run targeted tests for parent settings helpers.
- Run web lint after the UI/auth change.