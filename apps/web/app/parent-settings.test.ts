import { describe, expect, it } from "vitest";

import {
  PARENT_SYNC_MESSAGE,
  SUPPORTED_GRADES,
  getParentAccountDescription,
} from "./parent-settings";
import { getSyncIndicator } from "./parent-settings";

describe("parent settings config", () => {
  it("supports grades 1 through 3 in the parent selector", () => {
    expect(SUPPORTED_GRADES).toEqual([1, 2, 3]);
  });

  it("explains that signed-in parents sync across devices", () => {
    expect(getParentAccountDescription(true)).toContain(PARENT_SYNC_MESSAGE);
    expect(getParentAccountDescription(true)).toContain("Google");
  });

  it("keeps demo mode messaging clear when firebase is unavailable", () => {
    expect(getParentAccountDescription(false)).toContain("single device");
  });

  it("shows cloud sync when a parent is signed in", () => {
    expect(getSyncIndicator({ isFirebaseConfigured: true, isSignedIn: true, isLoading: false })).toEqual({
      label: "Cloud sync on",
      tone: "emerald",
    });
  });

  it("shows local mode when a parent is not signed in", () => {
    expect(getSyncIndicator({ isFirebaseConfigured: true, isSignedIn: false, isLoading: false })).toEqual({
      label: "Using this device only",
      tone: "amber",
    });
  });
});