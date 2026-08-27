import { expect, test, type Page } from "@playwright/test";
import { openCard, writeReply } from "./helpers";

const INTENT = "tell the teacher my son is allergic to eggs";
const STOPS = ["カジュアル", "丁寧", "敬語", "最敬語"] as const;

/* The foregrounded Japanese: the only pre-line paragraph on the page.
   (No landmark or label wraps the output — see the report.) */
const output = (page: Page) => page.locator("p.whitespace-pre-line");
const slider = (page: Page) => page.getByRole("slider", { name: "Politeness register" });

async function selectStop(page: Page, stop: (typeof STOPS)[number]): Promise<void> {
  await slider(page).getByText(stop, { exact: true }).click();
}

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.describe("reply panel (?mock=1)", () => {
  test("all four stops fill in; text and gloss change per stop; copy works", async ({ page }) => {
    await openCard(page, "mock=1");

    await expect(page.getByLabel("Who reads it?")).toHaveValue("My child's class teacher");
    await expect(page.getByRole("button", { name: "Write it in Japanese" })).toBeDisabled();

    await writeReply(page, INTENT);
    await expect(page.getByText(`“${INTENT}”`)).toBeVisible();
    await expect(page.getByText("to My child's class teacher")).toBeVisible();

    const track = slider(page);
    await expect(track).toHaveAttribute("aria-valuemin", "0");
    await expect(track).toHaveAttribute("aria-valuemax", "3");
    for (const stop of STOPS) await expect(track.getByText(stop, { exact: true })).toBeVisible();

    const texts: string[] = [];
    const glosses: string[] = [];
    const expectedEyebrow = [
      "Casual · カジュアル",
      "Polite (desu/masu) · 丁寧",
      "Business keigo · 敬語",
      "Formal written · 最敬語",
    ];
    for (const [i, stop] of STOPS.entries()) {
      await selectStop(page, stop);
      await expect(track).toHaveAttribute("aria-valuenow", String(i));
      await expect(page.getByText(expectedEyebrow[i])).toBeVisible();
      await expect(output(page)).not.toBeEmpty();
      await expect(page.getByText("Working out what changed at this level…")).toHaveCount(0);
      await expect(track.getByText(stop, { exact: true })).not.toHaveCSS(
        "text-decoration-line",
        "line-through",
      );
      texts.push((await output(page).innerText()).trim());
      glosses.push((await page.getByText(expectedEyebrow[i]).locator("+ p").innerText()).trim());
    }
    expect(new Set(texts).size).toBeGreaterThanOrEqual(3);
    expect(new Set(glosses).size).toBeGreaterThanOrEqual(3);
    expect(texts[3]).toContain("拝啓");
    expect(texts[2]).toContain("ございます");

    // Keyboard also moves the stop.
    await track.focus();
    await page.keyboard.press("Home");
    await expect(track).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("ArrowRight");
    await expect(track).toHaveAttribute("aria-valuenow", "1");

    // Copy puts exactly the foregrounded Japanese on the clipboard.
    const shown = (await output(page).innerText()).trim();
    await page.getByRole("button", { name: "Copy the Japanese" }).click();
    await expect(page.getByRole("button", { name: /Copied — paste it into LINE/ })).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.trim()).toBe(shown);
  });

  test("the slider never generates: no request to /api/reply while dragging", async ({ page }) => {
    let replyRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/reply") replyRequests += 1;
    });

    await openCard(page, "mock=1");
    await writeReply(page, INTENT);

    const box = await slider(page).boundingBox();
    if (!box) throw new Error("slider has no bounding box");
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 4, y);
    await page.mouse.down();
    for (let step = 1; step <= 12; step += 1) {
      await page.mouse.move(box.x + (box.width * step) / 12 - 2, y);
    }
    await page.mouse.up();
    await expect(slider(page)).toHaveAttribute("aria-valuenow", "3");

    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 4, y);
    await page.mouse.up();
    await expect(slider(page)).toHaveAttribute("aria-valuenow", "0");

    expect(replyRequests).toBe(0);
  });

  test("&fail=keigo marks 敬語 unavailable and leaves the other three intact", async ({ page }) => {
    await openCard(page, "mock=1&fail=keigo");
    await writeReply(page, INTENT);

    const track = slider(page);
    // Not selected: struck through on the slider.
    await expect(track.getByText("敬語", { exact: true })).toHaveCSS(
      "text-decoration-line",
      "line-through",
    );

    await selectStop(page, "敬語");
    await expect(page.getByText("This level could not be written.")).toBeVisible();
    await expect(page.getByText(/The other three are on the slider and unaffected/)).toBeVisible();
    await expect(page.getByText("No note for this level.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy the Japanese" })).toBeDisabled();

    for (const stop of ["カジュアル", "丁寧", "最敬語"] as const) {
      await selectStop(page, stop);
      await expect(page.getByText("This level could not be written.")).toHaveCount(0);
      await expect(output(page)).not.toBeEmpty();
      await expect(page.getByRole("button", { name: "Copy the Japanese" })).toBeEnabled();
    }
  });
});
