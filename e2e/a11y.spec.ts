import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { openCard, writeReply } from "./helpers";

const BLOCKING = new Set(["serious", "critical"]);

async function blockingViolations(page: Page) {
  // The card's entrance animations fade opacity in; axe reads contrast at
  // that instant. Let them finish so the result is deterministic.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => BLOCKING.has(v.impact ?? ""))
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.target.join(" ")),
    }));
}

test.describe("axe: no serious or critical violations", () => {
  test("capture screen", async ({ page }) => {
    await page.goto("/?mock=1");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
  });

  test("school card", async ({ page }) => {
    await openCard(page, "mock=1");
    expect(await blockingViolations(page)).toEqual([]);
  });

  test("lease card", async ({ page }) => {
    await openCard(page, "mock=lease");
    expect(await blockingViolations(page)).toEqual([]);
  });

  test("reply output", async ({ page }) => {
    await openCard(page, "mock=1");
    await writeReply(page, "tell the teacher my son is allergic to eggs");
    expect(await blockingViolations(page)).toEqual([]);
  });
});
