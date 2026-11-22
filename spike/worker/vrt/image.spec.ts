import { expect, test } from "@playwright/test";

test("swfz", async ({ page }) => {
	await page.goto("/swfz");
	await expect(page).toHaveScreenshot();
});

test("存在しないユーザー", async ({ page }) => {
	await page.goto("/no-such-user-xyz-kusa");
	await expect(page.getByText("Could not resolve to a User.")).toBeVisible();
});
