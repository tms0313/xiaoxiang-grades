const { test, expect } = require('@playwright/test');
const fs = require('fs');

fs.mkdirSync('screenshots', { recursive: true });

test('login page loads and core elements are visible', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', error => consoleErrors.push(error.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/小象文教機構/);

  const utilityChecks = await page.evaluate(() => ({
    dollar: typeof window.$ === 'function',
    escapeHtml: typeof window.escapeHtml === 'function',
    formatDate: typeof window.formatDate === 'function',
    fetchAllRows: typeof window.fetchAllRows === 'function',
    normalizeTaiwanMobile: typeof window.normalizeTaiwanMobile === 'function',
    getExamReleaseTimestamp: typeof window.getExamReleaseTimestamp === 'function',
    isExamReleasedAt: typeof window.isExamReleasedAt === 'function',
    renderExport: typeof window.renderExport === 'function',
    exportCsv: typeof window.exportCsv === 'function',
    renderStudents: typeof window.renderStudents === 'function',
    saveStudent: typeof window.saveStudent === 'function',
    toggleStudentStatus: typeof window.toggleStudentStatus === 'function',
    deleteStudent: typeof window.deleteStudent === 'function',
    renderTermExamEntry: typeof window.renderTermExamEntry === 'function',
    renderAlumniMockScores: typeof window.renderAlumniMockScores === 'function',
    renderLoginLogs: typeof window.renderLoginLogs === 'function',
    clearAllLoginLogs: typeof window.clearAllLoginLogs === 'function',
    renderStudentReviewRecords: typeof window.renderStudentReviewRecords === 'function',
    renderGuardians: typeof window.renderGuardians === 'function',
    deleteUnboundParentAccount: typeof window.deleteUnboundParentAccount === 'function',
    editParentAccount: typeof window.editParentAccount === 'function',
    createParentAccount: typeof window.createParentAccount === 'function',
    saveGuardianBinding: typeof window.saveGuardianBinding === 'function',
    removeGuardianBinding: typeof window.removeGuardianBinding === 'function',
    renderPasswords: typeof window.renderPasswords === 'function',
    getLinkedStudentNames: typeof window.getLinkedStudentNames === 'function',
    resetParentPassword: typeof window.resetParentPassword === 'function',
    deleteParentAccount: typeof window.deleteParentAccount === 'function',
    renderTeacherManagement: typeof window.renderTeacherManagement === 'function',
    addTeacherRoleToParent: typeof window.addTeacherRoleToParent === 'function',
    removeAdditionalTeacherRole: typeof window.removeAdditionalTeacherRole === 'function',
    createTeacherAccount: typeof window.createTeacherAccount === 'function',
    manageTeacherAccount: typeof window.manageTeacherAccount === 'function',
    saveTeacherAssignment: typeof window.saveTeacherAssignment === 'function',
    deleteTeacherAssignment: typeof window.deleteTeacherAssignment === 'function'
  }));
  expect(utilityChecks).toEqual({ dollar: true, escapeHtml: true, formatDate: true, fetchAllRows: true, normalizeTaiwanMobile: true, getExamReleaseTimestamp: true, isExamReleasedAt: true, renderExport: true, exportCsv: true, renderStudents: true, saveStudent: true, toggleStudentStatus: true, deleteStudent: true, renderTermExamEntry: true, renderAlumniMockScores: true, renderLoginLogs: true, clearAllLoginLogs: true, renderStudentReviewRecords: true, renderGuardians: true, deleteUnboundParentAccount: true, editParentAccount: true, createParentAccount: true, saveGuardianBinding: true, removeGuardianBinding: true, renderPasswords: true, getLinkedStudentNames: true, resetParentPassword: true, deleteParentAccount: true, renderTeacherManagement: true, addTeacherRoleToParent: false, removeAdditionalTeacherRole: true, createTeacherAccount: true, manageTeacherAccount: true, saveTeacherAssignment: true, deleteTeacherAssignment: true });

  // 樣式已改為獨立 CSS：確認 stylesheet 載入，且登入頁核心樣式仍生效。
  const appStylesLoaded = await page.evaluate(() => {
    const stylesheet = [...document.styleSheets].find(sheet =>
      sheet.href && new URL(sheet.href).pathname.endsWith('/app-styles.css')
    );
    let hasLoginCardRule = false;
    try {
      hasLoginCardRule = Boolean(stylesheet && [...stylesheet.cssRules].some(rule =>
        rule.selectorText && rule.selectorText.includes('.login-card')
      ));
    } catch (error) {
      hasLoginCardRule = false;
    }
    return {
      loaded: Boolean(stylesheet) && hasLoginCardRule,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      loginCardRadius: getComputedStyle(document.querySelector('.login-card')).borderRadius
    };
  });
  expect(appStylesLoaded.loaded, 'app-styles.css should load the extracted stylesheet rules').toBeTruthy();
  expect(appStylesLoaded.bodyBackground).toBe('rgb(243, 245, 248)');
  expect(appStylesLoaded.loginCardRadius).toBe('18px');

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
