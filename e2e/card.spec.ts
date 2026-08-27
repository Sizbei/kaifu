import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { openCard } from "./helpers";

test.describe("school card (?mock=1)", () => {
  test.beforeEach(async ({ page }) => {
    await openCard(page, "mock=1");
  });

  test("hero, original title and three obligations", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Permission slip and fee for the autumn class trip",
    );
    await expect(page.getByText("秋の遠足のお知らせ（三年生）")).toBeVisible();
    await expect(page.getByText("From みどり第二小学校　三年二組")).toBeVisible();
    await expect(page.getByText("What you have to do · 3")).toBeVisible();

    const obligations = page.getByRole("list").first().getByRole("listitem");
    await expect(obligations).toHaveCount(3);
    await expect(obligations.nth(0)).toContainText("Sign the tear-off slip");
    await expect(obligations.nth(1)).toContainText("¥1,200");
    await expect(obligations.nth(2)).toContainText("Pack a boxed lunch");
  });

  test("a date conflict shows BOTH readings, never a silently picked one", async ({ page }) => {
    const notice = page.getByRole("note");
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText("Check this date against the paper");
    await expect(notice).toContainText("We are not going to pick one for you.");

    const scanValue = notice.getByText("2026-10-09", { exact: true });
    const pageValue = notice.getByText("10月10日（金）", { exact: true });
    await expect(scanValue).toBeVisible();
    await expect(pageValue).toBeVisible();
    // Equal weight: the UI must not pick a winner, so neither is struck through.
    await expect(scanValue).not.toHaveCSS("text-decoration-line", "line-through");
    await expect(pageValue).not.toHaveCSS("text-decoration-line", "line-through");

    // The labels make it explicit which is which.
    await expect(notice.getByText("Model read")).toBeVisible();
    await expect(notice.getByText("Regex found on page")).toBeVisible();

    // And the flagged obligation is the one that carries the notice.
    const flagged = page.getByRole("listitem").filter({ has: notice });
    await expect(flagged).toContainText("Pack a boxed lunch");
  });

  test("Add to calendar downloads a VALUE=DATE .ics with the right date", async ({ page }) => {
    const buttons = page.getByRole("button", { name: "Add to calendar" });
    await expect(buttons).toHaveCount(3);

    const firstButton = page.getByRole("listitem").first().getByRole("button");
    const downloadPromise = page.waitForEvent("download");
    await firstButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.ics$/);
    expect(download.suggestedFilename()).toBe("kaifu-2026-10-03.ics");

    const filePath = await download.path();
    const ics = await readFile(filePath, "utf8");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261003");
    expect(ics).toContain("DTEND;VALUE=DATE:20261004");
    expect(ics).toContain("SUMMARY:Sign the tear-off slip");

    await expect(firstButton).toHaveText(/Calendar file saved/);
  });

  test("the conflicted obligation's .ics carries the conflict warning", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Add to calendar" }).nth(2).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("kaifu-2026-10-10.ics");
    const ics = await readFile(await download.path(), "utf8");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261010");
    expect(ics.replace(/\r\n /g, "")).toContain("Unconfirmed: the scan read");
  });
});
