import { describe, expect, it } from "vitest";

import { parsePrepDogTestPage, type QuestionPool } from "../src/index";

describe("parsePrepDogTestPage", () => {
  it("preserves question image URLs from imported PrepDog HTML", () => {
    const pool: QuestionPool = {
      id: "1-math-measurement-1",
      grade: 1,
      subject: "math",
      domain: "Measurement & Data",
      cluster: "Measure lengths indirectly and by iterating length units",
      standardCode: "1.MD.A.1",
      title: "Measurement Test 1",
      testNumber: 1,
      sourceUrl: "https://www.prepdog.org/1st/1md/test-1.html",
    };

    const html = `
      <script>
        ansMap[0] = 'B';
        questionText[0] = 'How many inches long is the pink smiley face in the picture?<br><img src="images/smiley.png" /> A. 2 inches B. 4 inches C. 6 inches D. 8 inches';
      </script>
    `;

    const result = parsePrepDogTestPage(html, pool);

    expect(result.questions[0]).toMatchObject({
      prompt: "How many inches long is the pink smiley face in the picture?",
      imageUrls: ["https://www.prepdog.org/1st/1md/images/smiley.png"],
    });
  });
});