import { expect, test } from "@playwright/test";
import { SAMPLE_PHOTO } from "./helpers";

test.describe("capture screen", () => {
  test("shows both inputs, the privacy guarantee, and the mock badge", async ({ page }) => {
    await page.goto("/?mock=1");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "The letter you have been putting off.",
    );
    await expect(page.getByRole("button", { name: "Photograph the document" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose a photo or scan" })).toBeVisible();

    const inputs = page.locator('input[type="file"]');
    await expect(inputs).toHaveCount(2);
    await expect(inputs.first()).toHaveAttribute("capture", "environment");
    await expect(inputs.nth(1)).toHaveAttribute("accept", "image/*");

    await expect(page.getByText(/^Nothing is kept/)).toBeVisible();
    // The corpus opt-in exists and is off by default.
    await expect(page.getByRole("checkbox")).toHaveCount(1);
    await expect(page.getByRole("checkbox")).not.toBeChecked();
    await expect(page.getByText("The photo is read once and discarded.")).toBeVisible();
    await expect(page.getByText("mock · school")).toBeVisible();
  });

  test("has no mock badge without ?mock=", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/^mock ·/)).toHaveCount(0);
  });

  test("uploading a photo walks through the three stages to the card", async ({ page }) => {
    await page.goto("/?mock=1");
    await page.locator('input[type="file"]:not([capture])').setInputFiles(SAMPLE_PHOTO);

    const stages = page.getByRole("list").getByRole("listitem");
    await expect(stages).toHaveCount(3);
    await expect(stages.nth(0)).toContainText("Reading the document");
    await expect(stages.nth(1)).toContainText("Checking dates and amounts");
    await expect(stages.nth(2)).toContainText("Writing your card");
    await expect(page.getByRole("img", { name: "The document you photographed" })).toBeVisible();

    // The mock decode resolves after ~5s and the stages advance in order.
    await expect(stages.nth(2)).toContainText("カードを作成中", { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Permission slip and fee for the autumn class trip",
      { timeout: 15_000 },
    );
    await expect(page.getByRole("button", { name: "New" })).toBeVisible();
  });
});
