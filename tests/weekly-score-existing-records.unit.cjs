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
