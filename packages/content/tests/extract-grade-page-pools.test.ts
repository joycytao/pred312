import { describe, expect, it } from "vitest";

import { extractGradePagePools } from "../src/index";

describe("extractGradePagePools", () => {
  it("keeps only links whose source URL matches the requested grade folder", () => {
    const html = `
      <html>
        <body>
          <h1>1st Grade</h1>
          <ul>
            <li>
              Geometry
              <a href="../K/kg1.html">Test 1</a>
            </li>
            <li>
              Geometry
              <a href="../2nd/2g1.html">Test 2</a>
            </li>
            <li>
              Language
              <a href="../1st/l.1.1.b.html">Test 3</a>
            </li>
          </ul>
        </body>
      </html>
    `;

    const pools = extractGradePagePools(html, 2);

    expect(pools).toHaveLength(1);
    expect(pools[0]?.sourceUrl).toBe("https://www.prepdog.org/2nd/2g1.html");
    expect(pools[0]?.grade).toBe(2);
  });

  it("falls back to same-grade html links when menu test links are cross-grade", () => {
    const html = `
      <html>
        <body>
          <ul>
            <li>
              Geometry
              <a href="../K/kg1.html">Test 1</a>
            </li>
          </ul>
          <div>
            <a href="../2nd/2ndgrade_math_core/2ccmnbtst1pre.html">2NBT practice</a>
            <a href="../2nd/2nd_common/l.2.1.b-_1b_irregular_plural_nouns.html">Plural nouns</a>
          </div>
        </body>
      </html>
    `;

    const pools = extractGradePagePools(html, 2);

    expect(pools).toHaveLength(2);
    expect(pools[0]?.sourceUrl).toBe("https://www.prepdog.org/2nd/2ndgrade_math_core/2ccmnbtst1pre.html");
    expect(pools[0]?.subject).toBe("math");
    expect(pools[1]?.sourceUrl).toBe("https://www.prepdog.org/2nd/2nd_common/l.2.1.b-_1b_irregular_plural_nouns.html");
    expect(pools[1]?.subject).toBe("ela");
  });

  it("deduplicates repeated source URLs from the grade menu", () => {
    const html = `
      <html>
        <body>
          <h1>1st Grade Math</h1>
          <ul>
            <li>
              Math Geometry
              <a href="../1st/1g3.1.html">Test 1</a>
            </li>
            <li>
              Math Geometry
              <a href="../1st/1g3.1.html">Test 1</a>
            </li>
          </ul>
        </body>
      </html>
    `;

    const pools = extractGradePagePools(html, 1, "math");

    expect(pools).toHaveLength(1);
    expect(pools[0]?.sourceUrl).toBe("https://www.prepdog.org/1st/1g3.1.html");
  });
});