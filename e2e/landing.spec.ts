import { expect, test } from "@playwright/test";

test("landing page loads and shows the product promise", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /barready/i, level: 1 }),
  ).toBeVisible();
});

test("unknown route shows not-found", async ({ page }) => {
  await page.goto("/nope");
  await expect(
    page.getByRole("heading", { name: /page not found/i }),
  ).toBeVisible();
});
