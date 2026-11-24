const { test, expect } = require('@playwright/test');
const fs = require('fs');

const ALLOWED_FONT_SIZES = new Set(['12px', '14px', '16px', '20px', '24px']);

const ADMIN_EMAIL = process.env.FONT_AUDIT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.FONT_AUDIT_ADMIN_PASSWORD;
const PARENT_EMAIL = process.env.FONT_AUDIT_PARENT_EMAIL;
const PARENT_PASSWORD = process.env.FONT_AUDIT_PARENT_PASSWORD;
const TEACHER_EMAIL = process.env.FONT_AUDIT_TEACHER_EMAIL;
const TEACHER_PASSWORD = process.env.FONT_AUDIT_TEACHER_PASSWORD;

const ADMIN_TABS = [
  ['overview', '週成績總覽'],
  ['reviews', '週考檢閱紀錄'], ['scores', '週成績登錄'],
  ['termScores', '段考成績登錄'], ['students', '學生管理'],
  ['attendance', '出缺席管理'], ['guardians', '家長帳號管理'],
  ['teachers', '教師管理'], ['alumni', '模考成績'],
  ['export', '成績匯出'], ['logs', '登入紀錄']
];

test('rendered typography inventory across admin, parent and teacher pages', async ({ page }) => {
  test.setTimeout(180000);
  expect([ADMIN_EMAIL, ADMIN_PASSWORD, PARENT_EMAIL, PARENT_PASSWORD, TEACHER_EMAIL, TEACHER_PASSWORD].every(Boolean),
    'All six FONT_AUDIT GitHub Secrets must be configured').toBeTruthy();

  fs.mkdirSync('font-audit', { recursive: true });
  const allRows = [];
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

  async function login(email, password) {
    await page.goto('/');
    await expect(page.locator('#loginForm')).toBeVisible();
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: '登入系統' }).click();
    await expect(page.locator('#loginForm')).toBeHidden({ timeout: 30000 });
    await page.locator('.topbar, .dashboard').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1200);
  }

  async function collect(role, pageLabel) {
    const rows = await page.evaluate(({ role, pageLabel }) => {
      const visible = el => {
        const style = getComputedStyle(el);
        return el.getClientRects().length > 0 && style.visibility !== 'hidden' &&
          style.display !== 'none' && Number(style.opacity) !== 0;
      };
      return Array.from(document.querySelectorAll('body *'))
        .filter(el => visible(el))
        .map(el => {
          const directText = Array.from(el.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent || '')
            .join(' ')
            .replace(/\s+/g, ' ').trim();
          if (!directText) return null;
          const style = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return {
            role, page: pageLabel, tag: el.tagName.toLowerCase(),
            className: typeof el.className === 'string' ? el.className : '',
            id: el.id || '', text: directText.slice(0, 180),
            fontSize: style.fontSize, fontWeight: style.fontWeight,
            lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
            width: Math.round(rect.width), height: Math.round(rect.height)
          };
        }).filter(Boolean);
    }, { role, pageLabel });
    allRows.push(...rows);
    const safe = pageLabel.replace(/[^a-z0-9-]/gi, '-');
    await page.screenshot({ path: `font-audit/${role}-${safe}.png`, fullPage: true });
  }

  // Admin account: visit all twelve dashboard tabs and collect visible text styles.
  await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page.locator('#adminTabs')).toBeVisible();
  for (const [tab] of ADMIN_TABS) {
    const link = page.locator(`#adminTabs [data-tab="${tab}"]`);
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForTimeout(1400);
    await collect('admin', tab);
  }

  // Dedicated parent account: audit parent view independently.
  await page.getByRole('button', { name: '登出' }).click();
  await login(PARENT_EMAIL, PARENT_PASSWORD);
  await collect('parent', 'parent-home');

  // Dedicated teacher account: audit teacher view independently.
  await page.getByRole('button', { name: '登出' }).click();
  await login(TEACHER_EMAIL, TEACHER_PASSWORD);
  await collect('teacher', 'teacher-home');

  const grouped = {};
  for (const row of allRows) {
    grouped[row.fontSize] ||= { count: 0, examples: [] };
    grouped[row.fontSize].count++;
    if (grouped[row.fontSize].examples.length < 10) {
      grouped[row.fontSize].examples.push({
        role: row.role, page: row.page, text: row.text, tag: row.tag,
        className: row.className, fontWeight: row.fontWeight, lineHeight: row.lineHeight
      });
    }
  }
  const summary = {
    auditedAt: new Date().toISOString(),
    pages: ADMIN_TABS.map(([tab]) => ({ role: 'admin', page: tab }))
      .concat([{ role: 'parent', page: 'parent-home' }, { role: 'teacher', page: 'teacher-home' }]),
    totalTextElements: allRows.length, fontSizeGroups: grouped, rows: allRows, pageErrors
  };
  fs.writeFileSync('font-audit/font-inventory.json', JSON.stringify(summary, null, 2));
  const headers = ['role','page','tag','className','id','text','fontSize','fontWeight','lineHeight','letterSpacing','width','height'];
  const cell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const csv = [headers.join(','), ...allRows.map(row => headers.map(key => cell(row[key])).join(','))].join('\n');
  fs.writeFileSync('font-audit/font-inventory.csv', '\uFEFF' + csv);
  console.log('SITE TYPOGRAPHY AUDIT SUMMARY', JSON.stringify({
    totalTextElements: allRows.length,
    fontSizes: Object.fromEntries(Object.entries(grouped).map(([size, value]) => [size, value.count])),
    pages: summary.pages, pageErrors
  }, null, 2));
  const fontSizeViolations = allRows.filter(row => !ALLOWED_FONT_SIZES.has(row.fontSize));
  fs.writeFileSync('font-audit/font-size-violations.json', JSON.stringify(fontSizeViolations, null, 2));
  console.log('TYPOGRAPHY WHITELIST CHECK', JSON.stringify({ allowed: [...ALLOWED_FONT_SIZES], violations: fontSizeViolations.length, examples: fontSizeViolations.slice(0, 30) }, null, 2));
  expect(allRows.length).toBeGreaterThan(0);
  expect(fontSizeViolations, 'Every visible text element must use 12, 14, 16, 20 or 24px').toEqual([]);
  expect(pageErrors, 'No JavaScript or console errors across audited roles and pages').toEqual([]);
});
