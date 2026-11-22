import { expect, test } from '@playwright/test';

// Cases carried over from deno-kusa-image's VRT, plus past_years, to and the Halloween palette.
const IMAGES: [string, string][] = [
  ['user search param', '/?user=swfz'],
  ['user path param', '/swfz'],
  ['user search param and path param', '/swfz?user=octocat'], // the path wins
  ['dark theme', '/swfz?theme=dark'],
  ['past_years=3', '/swfz?past_years=3'],
  ['past_years=19', '/swfz?past_years=19'],
  ['to', '/swfz?to=2023-12-31'],
  ['to dark theme', '/swfz?to=2023-12-31&theme=dark'],
  ['halloween', '/swfz-halloween'],
];

for (const [name, path] of IMAGES) {
  test(`image: ${name}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    expect(res?.headers()['content-type']).toBe('image/png');
    await expect(page).toHaveScreenshot({ fullPage: true });
  });
}

test('user does not exist', async ({ page }) => {
  const res = await page.goto('/no-such-user-xyz');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('Could not resolve to a User. no-such-user-xyz')).toBeVisible();
});

// The top page is HTML drawn with system fonts, whose antialiasing differs between arm64 and x86_64,
// so it is checked by content rather than by screenshot.
test('top page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Kusa Image' })).toBeVisible();
  await expect(page.getByText('https://kusa-image.swfz.dev/{username}?{parameters}')).toBeVisible();
  const samples = page.locator('img');
  await expect(samples).toHaveCount(5);
  for (const img of await samples.all()) {
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 670)).toBe(true);
  }
});
