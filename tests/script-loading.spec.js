const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EXPECTED_LOCAL_SCRIPTS = [
  'config.js',
  'attendance.js',
  'app-utils.js',
  'app-export.js',
  'app-students.js',
  'app-term-exams.js',
  'app-alumni-mock.js',
  'app-admin-audit.js',
  'app-guardians.js',
  'app-teachers.js',
  'app-styles.js',
  'app-overview.js',
  'app-score-entry.js',
  'app-parent.js',
  'app-teacher-dashboard.js',
  'app-admin-dashboard.js',
  'app-auth.js',
  'app.js'
];

test('all local application scripts are versioned, present and loaded in dependency order', async ({ page }) => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)]
    .map(match => match[1]);
  const localScripts = scriptTags
    .filter(src => !/^https?:\/\//i.test(src))
    .map(src => ({ src, file: path.basename(new URL(src, 'https://local.test/').pathname) }));

  expect(localScripts.map(item => item.file)).toEqual(EXPECTED_LOCAL_SCRIPTS);

  for (const item of localScripts) {
    const url = new URL(item.src, 'https://local.test/');
    expect(url.search, item.file + ' must have a cache-version query string').not.toBe('');
    expect(fs.existsSync(path.join(ROOT, item.file)), item.file + ' must exist in the repository').toBeTruthy();
  }

  const scriptResponses = [];
  const pageErrors = [];
  page.on('response', response => {
    const file = path.basename(new URL(response.url()).pathname);
    if (EXPECTED_LOCAL_SCRIPTS.includes(file)) {
      scriptResponses.push({ file, status: response.status() });
    }
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('#loginForm')).toBeVisible();

  const loadedFiles = scriptResponses.map(item => item.file);
  // HTTP response events may arrive in a different order from HTML script tags.
  // The HTML order is asserted above; here verify complete, unique, successful responses.
  expect([...loadedFiles].sort()).toEqual([...EXPECTED_LOCAL_SCRIPTS].sort());
  expect(new Set(loadedFiles).size).toBe(EXPECTED_LOCAL_SCRIPTS.length);
  expect(scriptResponses.filter(item => item.status !== 200)).toEqual([]);
  expect(pageErrors).toEqual([]);

  const moduleEntrypoints = await page.evaluate(() => ({
    attendance: typeof window.renderAttendanceManagement === 'function',
    utilities: typeof window.fetchAllRows === 'function',
    export: typeof window.renderExport === 'function',
    students: typeof window.renderStudents === 'function',
    termExams: typeof window.renderTermExamEntry === 'function',
    alumniMock: typeof window.renderAlumniMockScores === 'function',
    adminAudit: typeof window.renderLoginLogs === 'function',
    guardians: typeof window.renderGuardians === 'function',
    teachers: typeof window.renderTeacherManagement === 'function',
    adminDashboard: typeof window.renderAdminDashboard === 'function' &&
      typeof window.renderAdminTab === 'function' &&
      typeof window.renderAdminClassHighestPreview === 'function' &&
      typeof window.getAdminTabFromHash === 'function',
    teacherDashboard: typeof window.renderTeacherDashboard === 'function' &&
      typeof window.renderTeacherResults === 'function',
    parentDashboard: typeof window.renderParentDashboard === 'function' &&
      typeof window.buildParentBottomNav === 'function' &&
      typeof window.bindParentActionButtons === 'function',
    scoreEntry: typeof window.renderScoreEntry === 'function' &&
      typeof window.renderBulkScoreEntryRows === 'function' &&
      typeof window.saveBulkScores === 'function' &&
      typeof window.renderExistingWeeklyScores === 'function' &&
      typeof window.saveExistingWeeklyScore === 'function' &&
      typeof window.saveExam === 'function' &&
      typeof window.deleteExam === 'function',
    overview: typeof window.renderOverview === 'function' &&
      typeof window.refreshOverviewData === 'function' &&
      typeof window.editScore === 'function' &&
      typeof window.deleteScore === 'function',
    appStyles: [...document.querySelectorAll('style')].some(style =>
      style.textContent.includes('.login-card { width:min(420px,100%)')
    )
  }));

  expect(moduleEntrypoints).toEqual({
    attendance: true,
    utilities: true,
    export: true,
    students: true,
    termExams: true,
    alumniMock: true,
    adminAudit: true,
    guardians: true,
    teachers: true,
    overview: true,
    scoreEntry: true,
    parentDashboard: true,
    teacherDashboard: true,
    adminDashboard: true,
    appStyles: true
  });
});
