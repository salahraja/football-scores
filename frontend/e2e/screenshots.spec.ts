// Full-page screenshots of each view against the fake API. Only runs when SHOTS_DIR is set:
//   SHOTS_DIR=/some/dir npx playwright test screenshots
import { test } from "@playwright/test";

const dir = process.env.SHOTS_DIR;
const views = [["today", "/"], ["fixtures", "/fixtures"], ["table", "/table"], ["club", "/club/109"]];

test.skip(!dir, "set SHOTS_DIR to take screenshots");

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });
    for (const [name, path] of views) {
      test(name, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${dir}/${name}-${w}x${h}.png`, fullPage: true });
      });
    }
  });
}
