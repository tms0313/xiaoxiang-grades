const { test, expect } = require('@playwright/test');
const fs = require('fs');

fs.mkdirSync('screenshots', { recursive: true });

test('login page loads and core elements are visible', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', error => consoleErrors.push(error.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/小象文教機構/);

  // 確認共用工具模組已在主程式執行前載入，且原有全域函式名稱可正常呼叫。
  const utilityChecks = await page.evaluate(() => ({
    dollar: typeof window.$ === 'function',
    escapeHtml: typeof window.escapeHtml === 'function',
    formatDate: typeof window.formatDate === 'function',
    fetchAllRows: typeof window.fetchAllRows === 'function',
    normalizeTaiwanMobile: typeof window.normalizeTaiwanMobile === 'function',
    renderExport: typeof window.renderExport === 'function',
    exportCsv: typeof window.exportCsv === 'function',
    renderStudents: typeof window.renderStudents === 'function',
    saveStudent: typeof window.saveStudent === 'function',
    toggleStudentStatus: typeof window.toggleStudentStatus === 'function',
    deleteStudent: typeof window.deleteStudent === 'function'
  }));
  expect(utilityChecks).toEqual({ dollar: true, escapeHtml: true, formatDate: true, fetchAllRows: true, normalizeTaiwanMobile: true, renderExport: true, exportCsv: true, renderStudents: true, saveStudent: true, toggleStudentStatus: true, deleteStudent: true });

  // 確認抽離後的動態樣式已由 index.html 載入，且核心登入畫面樣式仍生效。
  const appStylesLoaded = await page.evaluate(() => {
    const styleElement = [...document.querySelectorAll('style')].find(el =>
      el.textContent.includes('.login-card { width:min(420px,100%)')
    );
    return {
      loaded: Boolean(styleElement),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      loginCardRadius: getComputedStyle(document.querySelector('.login-card')).borderRadius
    };
  });
  expect(appStylesLoaded.loaded, 'app-styles.js should inject the extracted style block').toBeTruthy();
  expect(appStylesLoaded.bodyBackground).toBe('rgb(243, 245, 248)');
  expect(appStylesLoaded.loginCardRadius).toBe('18px');

  // Capture the rendered page before assertions to preserve evidence if a check fails.
  await page.screenshot({ path: 'screenshots/login-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'screenshots/login-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  await expect(page.locator('.login-card')).toBeVisible();
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
