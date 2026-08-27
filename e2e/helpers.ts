import path from "node:path";
import { expect, type Page } from "@playwright/test";

export const SAMPLE_PHOTO = path.resolve(__dirname, "../public/samples/school-excursion.photo.jpg");

/** Upload the sample photo through the "Choose a photo or scan" input and wait for the card. */
export async function openCard(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  // Two hidden file inputs: camera (capture=environment) and library. Use the library one.
  await page.locator('input[type="file"]:not([capture])').setInputFiles(SAMPLE_PHOTO);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(
    "The letter you have been putting off.",
    { timeout: 20_000 },
  );
}

/** Fill the intent and submit; resolves once all four registers have settled. */
export async function writeReply(page: Page, intent: string): Promise<void> {
  await page.getByLabel("What do you want to say?").fill(intent);
  await page.getByRole("button", { name: "Write it in Japanese" }).click();
  await expect(page.getByRole("slider", { name: "Politeness register" })).toBeVisible();
  // The mock stream finishes when the longest register (formal) is glossed.
  await page.getByRole("slider", { name: "Politeness register" }).focus();
  await page.keyboard.press("End");
  await expect(page.getByText("Working out what changed at this level…")).toHaveCount(0, {
    timeout: 20_000,
  });
}
