import type { Subject } from "@prepdog/content";

const SUBJECT_PATHS: Record<Subject, "/math" | "/ela"> = {
  math: "/math",
  ela: "/ela",
};

export function getSubjectPath(subject: Subject) {
  return SUBJECT_PATHS[subject];
}

export function getSubjectForPathname(pathname: string): Subject | null {
  if (pathname === "/math") {
    return "math";
  }

  if (pathname === "/ela") {
    return "ela";
  }

  return null;
}
