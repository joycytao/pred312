import { describe, expect, it } from "vitest";

import { selectStaleQuestionDocuments } from "./firestore-rest";

describe("selectStaleQuestionDocuments", () => {
  it("returns only question documents that are no longer present in the imported pool", () => {
    const existingQuestionDocuments = [
      {
        id: "pool-q1",
        name: "projects/prepd-312/databases/(default)/documents/questions/pool-q1",
      },
      {
        id: "pool-q2",
        name: "projects/prepd-312/databases/(default)/documents/questions/pool-q2",
      },
      {
        id: "pool-q3",
        name: "projects/prepd-312/databases/(default)/documents/questions/pool-q3",
      },
    ];

    const staleDocuments = selectStaleQuestionDocuments(existingQuestionDocuments, [
      "pool-q1",
      "pool-q3",
    ]);

    expect(staleDocuments).toEqual([
      {
        id: "pool-q2",
        name: "projects/prepd-312/databases/(default)/documents/questions/pool-q2",
      },
    ]);
  });
});