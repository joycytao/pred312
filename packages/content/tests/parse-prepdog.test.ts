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

  it("keeps short-label answers when a page only has three options", () => {
    const pool: QuestionPool = {
      id: "1-math-geometry-3",
      grade: 1,
      subject: "math",
      domain: "Geometry",
      cluster: "Reason with shapes and their attributes",
      standardCode: "1.G.A.3",
      title: "Geometry Test 3",
      testNumber: 3,
      sourceUrl: "https://www.prepdog.org/1st/1g3.1.html",
    };

    const html = `
      <script>
        ansMap[0] = 'B';
        questionText[0] = '<div class="default">Which of the following shapes shows 2 quarters shaded? <img src="1g3-1_files/mc001-1.jpg" /></div><div class="default"><table><tr><td><div class="choice">a.</div></td><td><span class="default">1</span></td><td><div class="choice">c.</div></td><td><span class="default">3</span></td></tr><tr><td><div class="choice">b.</div></td><td><span class="default">2</span></td></tr></table></div>';
      </script>
    `;

    const result = parsePrepDogTestPage(html, pool);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toMatchObject({
      prompt: "Which of the following shapes shows 2 quarters shaded?",
      imageUrls: ["https://www.prepdog.org/1st/1g3-1_files/mc001-1.jpg"],
      correctChoiceId: "B",
      choices: [
        { id: "A", text: "1" },
        { id: "B", text: "2" },
        { id: "C", text: "3" },
      ],
    });
  });

  it("preserves image-based answer choices", () => {
    const pool: QuestionPool = {
      id: "1-math-geometry-4",
      grade: 1,
      subject: "math",
      domain: "Geometry",
      cluster: "Reason with shapes and their attributes",
      standardCode: "1.G.A.3",
      title: "Geometry Test 4",
      testNumber: 4,
      sourceUrl: "https://www.prepdog.org/1st/1g4.1.html",
    };

    const html = `
      <script>
        ansMap[0] = 'C';
        questionText[0] = '<div class="default">Pick the matching shape.</div><div class="default"><table><tr><td><div class="choice">a.</div></td><td><img src="choices/a.png" /></td><td><div class="choice">b.</div></td><td><img src="choices/b.png" /></td></tr><tr><td><div class="choice">c.</div></td><td><img src="choices/c.png" /></td></tr></table></div>';
      </script>
    `;

    const result = parsePrepDogTestPage(html, pool);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.choices).toEqual([
      { id: "A", text: "Image option A", imageUrl: "https://www.prepdog.org/1st/choices/a.png" },
      { id: "B", text: "Image option B", imageUrl: "https://www.prepdog.org/1st/choices/b.png" },
      { id: "C", text: "Image option C", imageUrl: "https://www.prepdog.org/1st/choices/c.png" },
    ]);
  });

  it("keeps superscript counting strategies readable in answer choices", () => {
    const pool: QuestionPool = {
      id: "1-math-number-operations-in-base-ten-11",
      grade: 1,
      subject: "math",
      domain: "Number & Operations in Base Ten",
      cluster: "Understand place value",
      standardCode: "1.NBT.11",
      title: "Base Ten Test 11",
      testNumber: 11,
      sourceUrl: "https://www.prepdog.org/1st/1nbt4.html",
    };

    const html = `
      <script>
        ansMap[0] = 'C';
        questionText[0] = '<div class="default">Which of the following is not a way to solve the following problem? 31+14</div><div class="default"><table cellpadding="0" cellspacing="0" width="95%" border="0"><tr valign="baseline"><td width="4%"><div class="choice">a.</div></td><td width="46%"><span class="default">30+10+1+4</span></td><td width="4%"><div class="choice">c.</div></td><td width="46%"><span class="default">31+4</span></td></tr><tr valign="baseline"><td><div class="choice">b.</div></td><td><span class="default">40+<sup>1</sup>41+<sup>1</sup>42+<sup>1</sup>43+<sup>1</sup>44+<sup>1</sup>45</span></td><td><div class="choice">d.</div></td><td><span class="default">31+10+4</span></td></tr></table></div>';
      </script>
    `;

    const result = parsePrepDogTestPage(html, pool);

    expect(result.questions[0]?.choices).toContainEqual({
      id: "B",
      text: "40+1 41+1 42+1 43+1 44+1 45",
    });
  });
});