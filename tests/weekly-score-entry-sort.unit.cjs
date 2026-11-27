const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'app-score-entry.js'), 'utf8');
const start = source.indexOf('function sortWeeklyScoreEntryStudents(');
const end = source.indexOf('function renderBulkScoreEntryRows()', start);
assert.ok(start >= 0 && end > start, 'weekly score sorting helper must exist');

const sandbox = {};
vm.runInNewContext(
  source.slice(start, end) + '\nglobalThis.sortWeeklyScoreEntryStudents = sortWeeklyScoreEntryStudents;',
  sandbox
);
const sortStudents = sandbox.sortWeeklyScoreEntryStudents;

test('sorts student codes numerically rather than lexicographically', () => {
  const input = [
    { student_code: 'G10', full_name: '十號' },
    { student_code: 'G2', full_name: '二號' },
    { student_code: 'G1', full_name: '一號' }
  ];
  assert.deepEqual(
    Array.from(sortStudents(input), student => student.student_code),
    ['G1', 'G2', 'G10']
  );
});

test('uses student name as a stable secondary ordering key for equal codes', () => {
  const input = [
    { student_code: 'A2', full_name: '陳小明' },
    { student_code: 'A2', full_name: '王小華' },
    { student_code: 'A1', full_name: '林小美' }
  ];
  assert.deepEqual(
    Array.from(sortStudents(input), student => student.full_name),
    ['林小美', '王小華', '陳小明']
  );
});

test('does not mutate the cached source array', () => {
  const input = [
    { student_code: 'G10', full_name: '十號' },
    { student_code: 'G2', full_name: '二號' }
  ];
  const originalOrder = input.map(student => student.student_code);
  const sorted = sortStudents(input);
  assert.deepEqual(input.map(student => student.student_code), originalOrder);
  assert.notStrictEqual(sorted, input);
});

test('handles missing codes and empty input without throwing', () => {
  const input = [
    { student_code: '', full_name: '乙' },
    { full_name: '甲' },
    { student_code: 'A1', full_name: '丙' }
  ];
  assert.equal(sortStudents(input).length, 3);
  assert.deepEqual(sortStudents(null), []);
});
