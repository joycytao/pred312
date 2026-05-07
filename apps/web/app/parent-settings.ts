export const SUPPORTED_GRADES = [1, 2, 3] as const;

export const PARENT_SYNC_MESSAGE = "Sign in to sync grade and saved results across your devices.";

export function getSyncIndicator({
  isFirebaseConfigured,
  isSignedIn,
  isLoading,
}: {
  isFirebaseConfigured: boolean;
  isSignedIn: boolean;
  isLoading: boolean;
}) {
  if (isFirebaseConfigured && isLoading) {
    return {
      label: "Checking sync",
      tone: "sky",
    } as const;
  }

  if (isFirebaseConfigured && isSignedIn) {
    return {
      label: "Cloud sync on",
      tone: "emerald",
    } as const;
  }

  return {
    label: "Using this device only",
    tone: "amber",
  } as const;
}

export function getParentAccountDescription(isFirebaseConfigured: boolean) {
  if (!isFirebaseConfigured) {
    return "Firebase is not configured yet, so parent settings stay on this single device until you add the app env values.";
  }

  return `Firebase client config detected. Continue with Google for the parent account. ${PARENT_SYNC_MESSAGE}`;
}
