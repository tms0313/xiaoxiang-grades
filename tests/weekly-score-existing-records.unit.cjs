const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-score-entry.js'), 'utf8');

test('existing weekly scores are listed using exam, class and subject without scope', () => {
  const start = source.indexOf('function renderExistingWeeklyScores()');
  const end = source.indexOf('async function saveExistingWeeklyScore', start);
  assert.ok(start >= 0 && end > start, 'existing-score renderer must exist');
  const renderer = source.slice(start, end);
  assert.match(renderer, /const examId = \$\("scoreExam"\)\.value/);
  assert.match(renderer, /const className = \$\("scoreClass"\)\.value/);
  assert.match(renderer, /const subject = \$\("scoreSubject"\)\.value/);
  assert.match(renderer, /String\(score\.exam_id\) === String\(examId\)/);
  assert.match(renderer, /student\.class_name === className && score\.subject === subject/);
  assert.doesNotMatch(renderer, /scoreScope|score\.scope\s*===/);
  assert.match(renderer, /data-existing-score-id/);
  assert.match(renderer, /data-save-existing-score/);
});

test('existing records are editable in place and retain their scope identity', () => {
  const start = source.indexOf('async function saveExistingWeeklyScore');
  const end = source.indexOf('async function refreshScoreCacheForScope', start);
  assert.ok(start >= 0 && end > start, 'existing-score save handler must exist');
  const handler = source.slice(start, end);
  assert.match(handler, /db\.from\("scores"\)\.update/);
  assert.match(handler, /\.eq\("id", id\)/);
  assert.doesNotMatch(handler, /scope\s*:/);
});

test('weekly score entry separates existing-score lookup from scope-required additions', () => {
  assert.match(source, /既有成績查詢與修改/);
  assert.match(source, /新增成績的考試範圍/);
  assert.match(source, /renderExistingWeeklyScores\(\);\s*renderBulkScoreEntryRows\(\);/);
});


test('existing and new weekly score tables preserve their distinct identifiers and aligned shared fields', () => {
  const renderer = source.slice(source.indexOf('function renderExistingWeeklyScores()'), source.indexOf('async function saveExistingWeeklyScore'));
  const bulkStart = source.indexOf('function renderBulkScoreEntryRows()');
  const bulkEnd = source.indexOf('function renderExistingWeeklyScores()', bulkStart);
  const bulk = source.slice(bulkStart, bulkEnd);

  assert.ok(renderer.includes("<th>編號</th><th>學生</th><th>考試範圍</th>"));
  assert.ok(renderer.includes("student.student_code"));
  assert.ok(renderer.includes("item.scope"));
  assert.match(renderer, /\[120, 140, 160, 140, 140, 200\]/);
  assert.match(renderer, /\[120, 140, 160, 140, 140, 140, 200\]/);
  assert.match(renderer, /weekly-score-layout-table/);

  assert.ok(bulk.includes("<th>學生</th><th>考試範圍</th>"));
  assert.doesNotMatch(bulk, /<th>編號<\/th>|student\.student_code/);
  assert.match(bulk, /data-bulk-scope type='text' value='" \+ escapeHtml\(scope\) \+ "' readonly/);
  assert.match(bulk, /weekly-score-layout-table/);
  assert.match(bulk, /\[140, 160, 140, 140, 200\]/);
  assert.match(bulk, /\[140, 160, 140, 140, 140, 200\]/);
});
