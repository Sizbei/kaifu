import { expect, test } from "@playwright/test";
import { openCard } from "./helpers";

test.describe("summary-only card (?mock=unclear)", () => {
  test("says so, shows no obligations and no calendar buttons", async ({ page }) => {
    await openCard(page, "mock=unclear");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "A notice from a ward office, partly unreadable",
    );
    await expect(page.getByText("Unclassified")).toBeVisible();
    await expect(page.getByText("Only a summary this time.")).toBeVisible();
    await expect(page.getByText(/A wrong deadline would be worse than none/)).toBeVisible();

    await expect(page.getByText(/What you have to do/)).toHaveCount(0);
    await expect(page.getByText("Nothing to do. This one is for information.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add to calendar" })).toHaveCount(0);
    await expect(page.getByRole("note")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Read the guideline" })).toHaveCount(0);

    // No issuer on this card, so no "From" line.
    await expect(page.getByText(/^From /)).toHaveCount(0);

    // Writing back is still offered.
    await expect(page.getByText("Write back")).toBeVisible();
    await expect(page.getByLabel("What do you want to say?")).toBeVisible();
  });
});
