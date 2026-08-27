import { expect, test } from "@playwright/test";
import { openCard } from "./helpers";

test.describe("lease card (?mock=lease)", () => {
  test.beforeEach(async ({ page }) => {
    await openCard(page, "mock=lease");
  });

  test("two findings, each with its citation showing", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Restoration and cleaning clauses in your tenancy agreement",
    );
    await expect(page.getByText("Clauses against the guideline · 2")).toBeVisible();

    const links = page.getByRole("link", { name: "Read the guideline" });
    await expect(links).toHaveCount(2);
    for (const link of await links.all()) {
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", /^https:\/\/www\.mlit\.go\.jp\//);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }

    const sources = page.getByText(/国土交通省「原状回復をめぐるトラブルとガイドライン/);
    await expect(sources).toHaveCount(2);
    for (const source of await sources.all()) await expect(source).toBeVisible();

    await expect(page.getByText("Differs from the guideline", { exact: true })).toBeVisible();
    await expect(page.getByText("Matches the guideline", { exact: true })).toBeVisible();
    await expect(page.getByText(/^第1章 /)).toHaveCount(2);
  });

  test("the strongest word is 'differs' and the disclaimer needs no interaction", async ({
    page,
  }) => {
    await expect(
      page.getByText(/This is not legal advice and no view is offered/),
    ).toBeVisible();
    await expect(page.getByText(/illegal|unfair|you should/i)).toHaveCount(0);
  });

  test("the amount conflict renders both values", async ({ page }) => {
    const notice = page.getByRole("note");
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText("Check this amount against the paper");

    const scanValue = notice.getByText("40,000円", { exact: true });
    const pageValue = notice.getByText("44,000円（税込）", { exact: true });
    await expect(scanValue).toBeVisible();
    await expect(pageValue).toBeVisible();
    await expect(scanValue).not.toHaveCSS("text-decoration-line", "line-through");
    await expect(pageValue).not.toHaveCSS("text-decoration-line", "line-through");
    await expect(notice.getByText("Model read")).toBeVisible();
    await expect(notice.getByText("Regex found on page")).toBeVisible();

    const flagged = page.getByRole("listitem").filter({ has: notice });
    await expect(flagged).toContainText("Pay the fixed room-cleaning charge");
    await expect(flagged).toContainText("¥44,000");
  });
});
