const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('all local stylesheets and scripts use the single declared asset version', () => {
  const versionMatch = html.match(/<meta\\s+name=["']asset-version["']\\s+content=["']([^"']+)["']/i);
  assert.ok(versionMatch, 'index.html must declare one asset-version meta value');
  const expectedVersion = versionMatch[1];

  const assetUrls = [
    ...[...html.matchAll(/<link\\b[^>]*\\bhref=["']([^"']+\\.css(?:\\?[^"']*)?)["'][^>]*>/gi)].map(match => match[1]),
    ...[...html.matchAll(/<script\\b[^>]*\\bsrc=["']([^"']+)["'][^>]*><\\/script>/gi)]
      .map(match => match[1])
  ].filter(url => !/^https?:\\/\\//i.test(url));

  assert.ok(assetUrls.length > 0, 'at least one local static asset must be declared');
  for (const assetUrl of assetUrls) {
    const parsed = new URL(assetUrl, 'https://xiaoxiang.local/');
    assert.equal(parsed.searchParams.get('v'), expectedVersion,
      `${parsed.pathname} must use the declared asset version ${expectedVersion}`);
    const localPath = path.join(__dirname, '..', decodeURIComponent(parsed.pathname.replace(/^\\//, '')));
    assert.ok(fs.existsSync(localPath), `${parsed.pathname} must exist`);
  }
});
