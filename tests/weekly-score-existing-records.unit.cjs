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

  assert.ok(bulk.includes("<th>編號</th><th>學生</th><th>考試範圍</th>"));
  assert.match(bulk, /student\.student_code/);
  assert.match(bulk, /data-bulk-scope type='text' value='" \+ escapeHtml\(scope\) \+ "' readonly/);
  assert.match(bulk, /weekly-score-layout-table/);
  assert.match(bulk, /\[120, 140, 160, 140, 140, 200\]/);
  assert.match(bulk, /\[120, 140, 160, 140, 140, 140, 200\]/);
});


test('weekly score inputs apply live red regular-weight warning below 60 and clear it at 60 or above', () => {
  const utils = fs.readFileSync(path.join(__dirname, '..', 'app-utils.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  assert.match(utils, /function updateScoreInputWarning\(input, enabled\)/);
  assert.match(utils, /input\.style\.setProperty\("color", "#d32626", "important"\)/);
  assert.match(utils, /input\.style\.setProperty\("font-weight", "400", "important"\)/);
  assert.match(utils, /input\.style\.removeProperty\("font-weight"\)/);
  assert.match(source, /root\.querySelectorAll\("\[data-bulk-score\]"\)\.forEach\(function \(input\) \{\s*updateScoreInputWarning/);
  assert.match(source, /input\.addEventListener\("input", function \(\) \{\s*updateScoreInputWarning\(input, warningEnabled\)/);
  assert.match(styles, /input\[data-bulk-score\]\.low-score[\s\S]*?color:\s*#dc2626\s*!important;[\s\S]*?font-weight:\s*400\s*!important;/);
  assert.match(styles, /input\[data-existing-value\]\.low-score/);
});

test('bulk weekly exam scope is 18px regular weight and remains readonly', () => {
  const bulkStart = source.indexOf('function renderBulkScoreEntryRows()');
  const bulkEnd = source.indexOf('function renderExistingWeeklyScores()', bulkStart);
  const bulk = source.slice(bulkStart, bulkEnd);
  const styles = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  assert.match(bulk, /data-bulk-scope type='text'[\s\S]*?readonly/);
  assert.match(styles, /input\[data-bulk-scope\][\s\S]*?font-size:\s*18px\s*!important;[\s\S]*?font-weight:\s*400\s*!important;/);
});

const appSource = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const overviewSource = fs.readFileSync(path.join(__dirname, '..', 'app-overview.js'), 'utf8');
const studentsSource = fs.readFileSync(path.join(__dirname, '..', 'app-students.js'), 'utf8');
const vm = require('node:vm');

test('score cache upsert and removal keep the ID and composite indexes consistent', () => {
  const cacheStart = appSource.indexOf('let scoresCache = [];');
  const cacheEnd = appSource.indexOf('let missingExclusionsCache = [];', cacheStart);
  assert.ok(cacheStart >= 0 && cacheEnd > cacheStart, 'score cache helpers must exist');

  const sandbox = {};
  vm.runInNewContext(
    appSource.slice(cacheStart, cacheEnd) +
      '\nglobalThis.cacheApi = {' +
      ' get scoresCache() { return scoresCache; },' +
      ' set scoresCache(value) { scoresCache = value; },' +
      ' get scoresByIdCache() { return scoresByIdCache; },' +
      ' get scoresByStudentExamSubjectScopeCache() { return scoresByStudentExamSubjectScopeCache; },' +
      ' rebuildScoresByIdCache, upsertScoreToLocalCache, removeScoreFromLocalCache, getScoreCompositeKey' +
      ' };',
    sandbox
  );

  const api = sandbox.cacheApi;
  const first = {
    id: 'score-1', student_id: 'student-1', exam_id: 'exam-1',
    subject: '數學', scope: '第一章', score: 72
  };
  const second = {
    id: 'score-2', student_id: 'student-2', exam_id: 'exam-1',
    subject: '數學', scope: '第一章', score: 88
  };
  api.scoresCache = [first, second];
  api.rebuildScoresByIdCache();

  assert.equal(api.scoresByIdCache.get('score-1'), first);
  assert.equal(
    api.scoresByStudentExamSubjectScopeCache.get(
      api.getScoreCompositeKey('student-1', 'exam-1', '數學', '第一章')
    ),
    first
  );

  const updated = {
    id: 'score-1', student_id: 'student-1', exam_id: 'exam-1',
    subject: '自然', scope: '第二章', score: 91
  };
  api.upsertScoreToLocalCache(updated);

  assert.equal(api.scoresCache.length, 2, 'updating an existing ID must not append a duplicate row');
  assert.equal(api.scoresByIdCache.get('score-1'), updated);
  assert.equal(
    api.scoresByStudentExamSubjectScopeCache.has(
      api.getScoreCompositeKey('student-1', 'exam-1', '數學', '第一章')
    ),
    false,
    'the previous composite key must be removed'
  );
  assert.equal(
    api.scoresByStudentExamSubjectScopeCache.get(
      api.getScoreCompositeKey('student-1', 'exam-1', '自然', '第二章')
    ),
    updated
  );

  api.removeScoreFromLocalCache('score-1');
  assert.equal(api.scoresCache.length, 1);
  assert.equal(api.scoresByIdCache.has('score-1'), false);
  assert.equal(
    api.scoresByStudentExamSubjectScopeCache.has(
      api.getScoreCompositeKey('student-1', 'exam-1', '自然', '第二章')
    ),
    false
  );
});

test('bulk score cache refresh rebuilds both lookup indexes after replacing a scope', () => {
  const start = source.indexOf('async function refreshScoreCacheForScope');
  const end = source.indexOf('async function saveSingleBulkScoreRow', start);
  assert.ok(start >= 0 && end > start, 'bulk score refresh helper must exist');
  const refresh = source.slice(start, end);
  assert.match(refresh, /scoresCache\.length = retainedCount/);
  assert.match(refresh, /refreshedRows\.forEach/);
  assert.match(refresh, /rebuildScoresByIdCache\(\)/);
  assert.match(refresh, /bulkEntryExistingScoresByStudent = new Map/);
});

test('overview score edits update the composite index and invalidate dependent summaries', () => {
  const start = overviewSource.indexOf('async function deleteScore');
  const editStart = overviewSource.lastIndexOf('const previousCompositeKey = getScoreCompositeKey', start);
  assert.ok(editStart >= 0, 'overview score edit must capture its previous composite key');
  const editBlock = overviewSource.slice(editStart, start);
  assert.match(editBlock, /Object\.assign\(score, result\.data\)/);
  assert.match(editBlock, /scoresByIdCache\.set/);
  assert.match(editBlock, /updateScoreCompositeIndex\(score, previousCompositeKey\)/);
  assert.match(editBlock, /invalidateAdminHighestPreviewCache\(\)/);
});

test('deleting a student removes all of that student’s score index entries', () => {
  const start = studentsSource.indexOf('async function deleteStudent');
  assert.ok(start >= 0, 'student deletion handler must exist');
  const handler = studentsSource.slice(start);
  assert.match(handler, /scoresCache = scoresCache\.filter/);
  assert.match(handler, /scoresByIdCache\.delete/);
  assert.match(handler, /scoresByStudentExamSubjectScopeCache\.delete/);
  assert.match(handler, /rebuildAdminEntityIndexes\(\)/);
  assert.match(handler, /rebuildActiveSubjectsByStudentCache\(\)/);
  assert.match(handler, /rebuildGuardianBindingIndexes\(\)/);
});


test('weekly score entry sorts student codes numerically, then names, without mutating its cache', () => {
  const helperStart = source.indexOf('function sortWeeklyScoreEntryStudents(');
  const helperEnd = source.indexOf('function renderBulkScoreEntryRows()', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'weekly score sorting helper must exist');
  const sandbox = {};
  vm.runInNewContext(
    source.slice(helperStart, helperEnd) +
      '\nglobalThis.sortWeeklyScoreEntryStudents = sortWeeklyScoreEntryStudents;',
    sandbox
  );

  const students = [
    { id: '10', student_code: 'G10', full_name: '小十' },
    { id: '2b', student_code: 'G2', full_name: 'B同學' },
    { id: '1', student_code: 'G1', full_name: '小一' },
    { id: '2a', student_code: 'G2', full_name: 'A同學' }
  ];
  const originalOrder = students.map(student => student.id);
  const sorted = sandbox.sortWeeklyScoreEntryStudents(students);

  assert.deepEqual(sorted.map(student => student.id), ['1', '2a', '2b', '10']);
  assert.deepEqual(students.map(student => student.id), originalOrder, 'sorting must not mutate the cached source array');
  assert.deepEqual(Array.from(sandbox.sortWeeklyScoreEntryStudents(null)), []);
});
