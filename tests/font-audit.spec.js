const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('font-size audit: capture rendered text sizes on accessible pages', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.login-card')).toBeVisible();

  const rows = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('body *'));
    return elements
      .filter(el => {
        const text = (el.innerText || el.textContent || '').trim();
        return text && el.getClientRects().length > 0;
      })
      .map(el => {
        const style = getComputedStyle(el);
        const text = (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 100);
        return {
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === 'string' ? el.className : '',
          id: el.id || '',
          text,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight
        };
      });
  });

  const grouped = {};
  for (const row of rows) {
    grouped[row.fontSize] ||= { count: 0, samples: [] };
    grouped[row.fontSize].count++;
    if (grouped[row.fontSize].samples.length < 12 && row.text) grouped[row.fontSize].samples.push(row);
  }

  fs.mkdirSync('font-audit', { recursive: true });
  fs.writeFileSync('font-audit/font-sizes.json', JSON.stringify({ scannedAt: new Date().toISOString(), page: '/', rows, grouped }, null, 2));
  const headers = ['tag','className','id','text','fontSize','fontWeight','lineHeight'];
  const csvCell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const csv = [headers.join(','), ...rows.map(row => headers.map(key => csvCell(row[key])).join(','))].join('\n')].join('\n');
  fs.writeFileSync('font-audit/font-sizes.csv', '\uFEFF' + csv);

  console.log('FONT AUDIT SUMMARY', JSON.stringify(grouped, null, 2));
  expect(rows.length).toBeGreaterThan(0);
});
