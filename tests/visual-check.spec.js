const { test, expect } = require('@playwright/test');
const fs = require('fs');

fs.mkdirSync('screenshots', { recursive: true });

test('login page loads and core elements are visible', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', error => consoleErrors.push(error.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/小象文教機構/);

  // Capture the rendered page before assertions to preserve evidence if a check fails.
  await page.screenshot({ path: 'screenshots/login-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'screenshots/login-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  await expect(page.locator('.login-card')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('小象文教機構');
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.getByRole('button', { name: '登入系統' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow, 'mobile layout should not have horizontal overflow').toBeFalsy();
  for (const selector of ['#email', '#password', '#loginForm button']) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThan(0);
  }
  expect(consoleErrors).toEqual([]);
});
