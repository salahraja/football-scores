import { expect, test } from "@playwright/test";

const views = [
  { name: "today", path: "/", ready: "text=Serie A" },
  { name: "fixtures", path: "/fixtures", ready: "article" },
  { name: "table", path: "/table", ready: "table.standings" },
  { name: "club", path: "/club/109", ready: "text=Allianz Stadium" },
];

for (const size of [{ w: 320, h: 700 }, { w: 390, h: 844 }, { w: 1280, h: 800 }, { w: 1440, h: 900 }]) {
  test.describe(`${size.w}px`, () => {
    test.use({ viewport: { width: size.w, height: size.h } });
    for (const v of views) {
      test(`${v.name} loads without sideways page scroll`, async ({ page }) => {
        await page.goto(v.path);
        await page.locator(v.ready).first().waitFor();
        const { scroll, client } = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(scroll).toBeLessThanOrEqual(client);
        if (v.name === "table" && size.w >= 900) {
          // wide screens: the table fits, no inner scroll needed
          const box = await page.locator(".table-scroll").evaluate((e) => e.scrollWidth <= e.clientWidth);
          expect(box).toBe(true);
        }
      });
    }
  });
}
